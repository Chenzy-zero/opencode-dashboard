import { app, powerMonitor, type Tray } from 'electron'
import { join } from 'node:path'

import { derivePanelView, type PanelView } from '../core/panel-view.ts'
import { createRefreshScheduler, type RefreshReason } from '../core/refresh-scheduler.ts'
import type { UsageResult } from '../core/types.ts'
import { readUsage } from '../core/usage.ts'
import { deriveTrayView } from '../core/view-model.ts'
import { createPanel, type Panel } from './panel.ts'
import { applyTrayView, createTray } from './tray.ts'

app.setName('OpenCode Dashboard')

/** Panel repaints are also refreshes, but they are not a scheduler reason. */
type RefreshCause = RefreshReason | 'panel'

let tray: Tray | null = null
let panel: Panel | null = null
let scheduler: ReturnType<typeof createRefreshScheduler> | null = null
let polling = false

/**
 * The newest poll outcome is the single source of truth for both the tray and
 * the panel. `lastFetchedAt` survives failure states so the panel can say how
 * old the last numbers are without re-displaying them.
 */
let latestState: UsageResult = { status: 'offline' }
let lastFetchedAt: number | null = null

function trayIconPath(): string {
  // electron-vite runs main from out/main in dev; packaged builds copy the
  // resources via electron-builder's extraResources.
  return app.isPackaged
    ? join(process.resourcesPath, 'trayTemplate.png')
    : join(__dirname, '../../resources/trayTemplate.png')
}

function panelView(): PanelView {
  return derivePanelView({ state: latestState, now: Date.now(), lastFetchedAt })
}

function renderPanel(): void {
  panel?.update(panelView())
}

function render(state: UsageResult): void {
  latestState = state
  if (state.status === 'online') lastFetchedAt = state.fetchedAt

  if (tray && !tray.isDestroyed()) {
    const view = deriveTrayView(state)
    applyTrayView(tray, view)
    if (!app.isPackaged) {
      // Development breadcrumb: what the menu bar should now show.
      console.log(`[tray] title=${JSON.stringify(view.text)} level=${view.level}`)
    }
  }

  // Keep the panel in lockstep: a failed poll clears its numbers instead of
  // leaving yesterday's percentages on screen.
  renderPanel()
}

async function refresh(reason: RefreshCause): Promise<void> {
  if (polling) return
  polling = true
  try {
    const result = await readUsage()
    // Never log credentials or raw payloads; the status is enough to debug.
    console.log(`[usage] ${reason} refresh -> ${result.status}`)
    // render() runs only after the fetch settles, so the tray and panel keep
    // showing the previous numbers while a refresh is in flight.
    render(result)
  } catch (error) {
    // readUsage classifies expected failures; anything reaching here is a bug
    // and must still not take the menu-bar app down or leave a stale number.
    console.error('[usage] unexpected refresh failure:', error instanceof Error ? error.message : error)
    render({ status: 'error' })
  } finally {
    polling = false
  }
}

const togglePanel = (bounds: Electron.Rectangle): void => {
  panel?.toggle(bounds)
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory')
  }

  panel = createPanel({
    // Showing the panel is also a "give me current numbers" gesture, and the
    // 30 s tick keeps the countdown text from going stale while it stays open.
    onShow: () => {
      renderPanel()
      void refresh('panel')
    },
    onTick: renderPanel,
  })

  scheduler = createRefreshScheduler({
    // `refresh` already serialises requests: a tick that lands while the
    // previous one is still running is skipped rather than queued.
    onTick: (reason) => void refresh(reason),
  })

  tray = createTray({
    iconPath: trayIconPath(),
    onToggle: togglePanel,
    // The tray menu's 「立即刷新」 goes through the scheduler so the menu and
    // the interval share one code path (and one tested clock).
    onRefresh: () => scheduler?.trigger(),
    onQuit: () => app.quit(),
  })

  // Show the offline state until the first poll lands: never a made-up number.
  render(latestState)
  scheduler.start()

  // macOS resume: fetch once right away, then resume the 60 s cadence. Only
  // `resume` counts as waking; `unlock-screen` fires far more often.
  powerMonitor.on('resume', () => {
    console.log('[power] resume -> refresh')
    scheduler?.notifyWake()
  })

  if (!app.isPackaged) {
    // getBounds() is unreliable for the first ~500 ms (electron#35984); read it
    // once later as a launch check that macOS really placed a status item.
    setTimeout(() => {
      if (tray && !tray.isDestroyed()) console.log('[tray] bounds', tray.getBounds())
    }, 1_500)
  }

  // Dev smoke check for headless sessions: exercises the same toggle path a
  // tray click uses and the same manual-refresh path the tray menu uses, logs
  // the results, and leaves the app running normally.
  if (!app.isPackaged && process.env['OPENCODE_DASHBOARD_SMOKE'] === '1') {
    setTimeout(() => {
      if (!tray || tray.isDestroyed()) return
      console.log('[smoke] invoking tray click path')
      togglePanel(tray.getBounds())
    }, 2_500)

    setTimeout(() => {
      console.log('[smoke] invoking tray menu refresh path')
      scheduler?.trigger()
    }, 4_500)
  }
})

app.on('before-quit', () => {
  scheduler?.stop()
  scheduler = null
  panel?.destroy()
  panel = null
})
