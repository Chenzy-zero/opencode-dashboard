import { app, powerMonitor, screen, type Tray } from 'electron'
import { join } from 'node:path'

import { installProcessGuards } from './console-guard.ts'
import { diag, initDiagnostics } from './diagnostics.ts'

initDiagnostics()
installProcessGuards()

import { resolveBallPosition } from '../core/ball-position.ts'
import { DEFAULT_BALL_STATE, type BallState } from '../core/ball-state.ts'
import { deriveBallView } from '../core/ball-view.ts'
import { derivePanelView, type PanelView } from '../core/panel-view.ts'
import { createRefreshRunner, type RefreshRunner } from '../core/refresh-runner.ts'
import { createRefreshScheduler, type RefreshReason } from '../core/refresh-scheduler.ts'
import type { UsageResult, UsageState } from '../core/types.ts'
import { readUsage } from '../core/usage.ts'
import { deriveTrayView } from '../core/view-model.ts'
import { BALL_SIZE, createBall, type Ball } from './ball.ts'
import {
  logTrayBoundsWhenDev,
  runLoginProbeIfRequested,
  startSmokeHarnessIfRequested,
} from './dev.ts'
import { createLoginItemController } from './login-item.ts'
import { devLog } from './log.ts'
import { createPanel, type Panel } from './panel.ts'
import { createBallStateStore } from './preferences.ts'
import { applyTrayView, createTray } from './tray.ts'

app.setName('OpenCode Dashboard')

// A second instance would create a second status item and race the first one's
// preferences, so only the first launch survives.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
diag('app.lock', { acquired: hasSingleInstanceLock })
if (!hasSingleInstanceLock) app.quit()

diag('app.start', { version: app.getVersion(), packaged: app.isPackaged })

app.on('second-instance', () => diag('app.second-instance'))
app.on('render-process-gone', (_event, contents, details) => {
  diag('renderer.gone', {
    url: contents.getURL(),
    reason: details.reason,
    exitCode: details.exitCode,
  })
})
app.on('child-process-gone', (_event, details) => {
  diag('child.gone', { type: details.type, reason: details.reason, exitCode: details.exitCode })
})

let tray: Tray | null = null
let panel: Panel | null = null
let ball: Ball | null = null
let ballStore: ReturnType<typeof createBallStateStore> | null = null
let ballState: BallState = { ...DEFAULT_BALL_STATE }
let ballTicker: ReturnType<typeof setInterval> | null = null
let scheduler: ReturnType<typeof createRefreshScheduler> | null = null
let refresher: RefreshRunner | null = null

/**
 * The newest poll outcome is the single source of truth for the tray and the
 * panel. It starts neutral: before the first poll settles there is no failure
 * reason to claim. `lastFetchedAt` survives failure states so the panel can say
 * how old the last numbers are without re-displaying them.
 */
let latestState: UsageState = { status: 'loading' }
let lastFetchedAt: number | null = null

function trayIconPath(): string {
  // electron-vite runs main from out/main in dev; packaged builds copy the
  // resources via electron-builder's extraResources.
  return app.isPackaged
    ? join(process.resourcesPath, 'trayTemplate.png')
    : join(__dirname, '../../resources/trayTemplate.png')
}

function panelView(): PanelView {
  return derivePanelView({
    state: latestState,
    now: Date.now(),
    lastFetchedAt,
    isRefreshing: refresher?.isRefreshing() ?? false,
  })
}

function renderPanel(): void {
  panel?.update(panelView())
}

function renderBall(): void {
  ball?.update(deriveBallView({ state: latestState, now: Date.now() }))
}

/** Persists visibility and geometry together: one file, one source of truth. */
function saveBallState(): void {
  ballStore?.save(ballState)
}

function setBallVisible(visible: boolean): void {
  ballState = { ...ballState, visible }
  if (visible) ball?.show()
  else ball?.hide()
  saveBallState()
  devLog(`[ball] visible=${visible}`)
}

function renderTray(): void {
  if (!tray || tray.isDestroyed()) return

  const view = deriveTrayView({ state: latestState, now: Date.now(), lastFetchedAt })
  applyTrayView(tray, view)
  devLog(`[tray] title=${JSON.stringify(view.text)} level=${view.level}`)
}

function render(state: UsageState): void {
  latestState = state
  if (state.status === 'online') lastFetchedAt = state.fetchedAt

  renderTray()
  // Keep the panel and ball in lockstep: a failed poll clears their numbers
  // instead of leaving yesterday's percentages on screen.
  renderPanel()
  renderBall()
}

/**
 * One poll. `readUsage` classifies expected failures itself; anything reaching
 * the catch is a bug and must still not take the menu-bar app down or leave a
 * stale number. The runner, not this function, serialises calls.
 */
async function pollUsage(reason: RefreshReason): Promise<UsageResult> {
  const result = await readUsage()
  // Never log credentials or raw payloads; the status is enough to debug.
  devLog(`[usage] ${reason} refresh -> ${result.status}`)
  return result
}

const togglePanel = (bounds: Electron.Rectangle): void => {
  diag('tray.click', bounds)
  panel?.toggle(bounds)
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory')
  }

  refresher = createRefreshRunner({
    refresh: pollUsage,
    // render() runs only after the fetch settles, so the tray and panel keep
    // showing the previous numbers while a refresh is in flight.
    onResult: render,
    // Start/end of an in-flight poll: repaint the light indicator only.
    onChange: renderPanel,
    onError: (error, reason) => {
      diag('usage.error', {
        reason,
        message: error instanceof Error ? error.message : String(error),
      })
    },
  })

  panel = createPanel({
    // Showing the panel is also a "give me current numbers" gesture, and the
    // 30 s tick keeps the countdown text from going stale while it stays open.
    onShow: () => {
      diag('panel.show')
      renderPanel()
      scheduler?.trigger()
    },
    onTick: renderPanel,
    // Same scheduler entry point as the tray menu's 「立即刷新」: one code path,
    // one tested cadence, and a success repaints the panel through render().
    onRetry: () => scheduler?.trigger(),
  })
  diag('panel.create')

  scheduler = createRefreshScheduler({
    // `refresher` serialises requests: a tick during an in-flight poll becomes
    // one queued follow-up instead of being dropped or overlapping.
    onTick: (reason) => refresher?.run(reason),
  })

  ballStore = createBallStateStore(join(app.getPath('userData'), 'ball-state.json'))
  ballState = ballStore.load()

  const displays = screen.getAllDisplays().map((display) => ({
    id: display.id,
    workArea: display.workArea,
  }))
  const restored = resolveBallPosition(
    ballState,
    BALL_SIZE,
    displays,
    screen.getPrimaryDisplay().id,
  )
  ballState = { ...ballState, ...restored }

  ball = createBall({
    initialPosition: restored,
    // A click on the ball opens the same detail panel as a tray click, placed
    // next to the ball rather than under the menu bar.
    onOpenPanel: togglePanel,
    onGeometry: (geometry) => {
      ballState = { ...ballState, ...geometry }
      saveBallState()
    },
    // Identical entry point to the tray menu's 「立即刷新」.
    onRefresh: () => scheduler?.trigger(),
    onHide: () => setBallVisible(false),
    onQuit: () => app.quit(),
  })

  // The countdown is minute-granular; repaint it even when no poll lands.
  ballTicker = setInterval(renderBall, 30_000)

  // SMAppService (macOS 13+) is the OS's record, not ours: the port is the whole
  // of the app's contact with it, and every menu open reads it back.
  const loginItem = createLoginItemController({
    packaged: app.isPackaged,
    platform: process.platform,
    read: () => app.getLoginItemSettings(),
    write: (openAtLogin) => app.setLoginItemSettings({ openAtLogin }),
  })
  devLog('[login] startup', JSON.stringify(loginItem.view()))

  tray = createTray({
    iconPath: trayIconPath(),
    onToggle: togglePanel,
    // The tray menu's 「立即刷新」 goes through the scheduler so the menu and
    // the interval share one code path (and one tested clock).
    onRefresh: () => scheduler?.trigger(),
    isBallVisible: () => ballState.visible,
    onToggleBall: () => setBallVisible(!ballState.visible),
    loginItem: () => loginItem.view(),
    onToggleLoginItem: () => {
      const view = loginItem.toggle()
      // The OS status is the only evidence a login item exists; log it so a
      // silent failure is visible without a debugger.
      devLog('[login] toggled', JSON.stringify(view))
    },
    onQuit: () => app.quit(),
  })

  // Show the neutral loading state until the first poll lands: never a made-up
  // number and never a failure reason the app has not observed.
  render(latestState)
  scheduler.start()

  runLoginProbeIfRequested(loginItem)

  // Restore the ball's saved visibility. `show` waits for the renderer so an
  // empty window never appears.
  if (ballState.visible) ball.show()

  // A monitor change must not strand the ball off-screen.
  const reclamp = (): void => ball?.reclamp()
  screen.on('display-added', reclamp)
  screen.on('display-removed', reclamp)
  screen.on('display-metrics-changed', reclamp)

  // macOS resume: fetch once right away, then resume the 60 s cadence. Only
  // `resume` counts as waking; `unlock-screen` fires far more often.
  powerMonitor.on('resume', () => {
    devLog('[power] resume -> refresh')
    scheduler?.notifyWake()
  })

  logTrayBoundsWhenDev(() => tray)

  startSmokeHarnessIfRequested({
    tray: () => tray,
    togglePanel,
    refresh: () => scheduler?.trigger(),
    retryPanel: () => panel?.retry(),
    setBallVisible,
    ball: () => ball,
    ballState: () => ballState,
  })
})

app.on('before-quit', () => {
  scheduler?.stop()
  scheduler = null
  refresher = null
  if (ballTicker) {
    clearInterval(ballTicker)
    ballTicker = null
  }
  // Last chance to keep the ball where the user left it.
  saveBallState()
  ball?.destroy()
  ball = null
  panel?.destroy()
  panel = null
})
