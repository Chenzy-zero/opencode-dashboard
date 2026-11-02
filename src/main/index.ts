import { app, type Tray } from 'electron'
import { join } from 'node:path'

import { derivePanelView, type PanelView } from '../core/panel-view.ts'
import type { UsageResult } from '../core/types.ts'
import { readUsage } from '../core/usage.ts'
import { deriveTrayView } from '../core/view-model.ts'
import { createPanel, type Panel } from './panel.ts'
import { applyTrayView, createTray } from './tray.ts'

app.setName('OpenCode Dashboard')

/** v1 constant; the scheduler gets its own tested home in #4. */
const POLL_INTERVAL_MS = 60_000

let tray: Tray | null = null
let panel: Panel | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
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

async function refresh(reason: 'startup' | 'manual' | 'interval' | 'panel'): Promise<void> {
  if (polling) return
  polling = true
  try {
    const result = await readUsage()
    // Never log credentials or raw payloads; the status is enough to debug.
    console.log(`[usage] ${reason} refresh -> ${result.status}`)
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

  tray = createTray({
    iconPath: trayIconPath(),
    onToggle: togglePanel,
    onRefresh: () => void refresh('manual'),
    onQuit: () => app.quit(),
  })

  // Show the offline state until the first poll lands: never a made-up number.
  render(latestState)
  void refresh('startup')

  if (!app.isPackaged) {
    // getBounds() is unreliable for the first ~500 ms (electron#35984); read it
    // once later as a launch check that macOS really placed a status item.
    setTimeout(() => {
      if (tray && !tray.isDestroyed()) console.log('[tray] bounds', tray.getBounds())
    }, 1_500)
  }

  // Dev smoke check for headless sessions: exercises the same toggle path a
  // tray click uses, logs the result, and leaves the app running normally.
  if (!app.isPackaged && process.env['OPENCODE_DASHBOARD_SMOKE'] === '1') {
    setTimeout(() => {
      if (!tray || tray.isDestroyed()) return
      console.log('[smoke] invoking tray click path')
      togglePanel(tray.getBounds())
    }, 2_500)
  }

  pollTimer = setInterval(() => void refresh('interval'), POLL_INTERVAL_MS)
})

app.on('before-quit', () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  panel?.destroy()
  panel = null
})
