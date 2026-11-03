import { BrowserWindow, app, powerMonitor, screen, type Tray } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveBallPosition } from '../core/ball-position.ts'
import { DEFAULT_BALL_STATE, type BallState } from '../core/ball-state.ts'
import { deriveBallView } from '../core/ball-view.ts'
import { derivePanelView, type PanelView } from '../core/panel-view.ts'
import { createRefreshScheduler, type RefreshReason } from '../core/refresh-scheduler.ts'
import type { UsageResult } from '../core/types.ts'
import { readUsage } from '../core/usage.ts'
import { deriveTrayView } from '../core/view-model.ts'
import { BALL_SIZE, createBall, type Ball } from './ball.ts'
import { createLoginItemController, type LoginItemController } from './login-item.ts'
import { createPanel, type Panel } from './panel.ts'
import { createBallStateStore } from './preferences.ts'
import { applyTrayView, createTray } from './tray.ts'

app.setName('OpenCode Dashboard')

/** Panel repaints are also refreshes, but they are not a scheduler reason. */
type RefreshCause = RefreshReason | 'panel'

let tray: Tray | null = null
let panel: Panel | null = null
let ball: Ball | null = null
let ballStore: ReturnType<typeof createBallStateStore> | null = null
let ballState: BallState = { ...DEFAULT_BALL_STATE }
let ballTicker: ReturnType<typeof setInterval> | null = null
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
  console.log(`[ball] visible=${visible}`)
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

  // Keep the panel and ball in lockstep: a failed poll clears their numbers
  // instead of leaving yesterday's percentages on screen.
  renderPanel()
  renderBall()
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

/**
 * Dev-only: prove the ball's ring and number actually painted, and that the
 * countdown fits its pill, without needing screen-recording permissions —
 * capturePage reads the renderer's own surface.
 */
async function captureBallForSmoke(): Promise<void> {
  const ballWindow = BrowserWindow.getAllWindows().find((window) =>
    window.webContents.getURL().includes('ball.html'),
  )
  if (!ballWindow) {
    console.log('[smoke] ball window not found for capture')
    return
  }

  const metrics: unknown = await ballWindow.webContents.executeJavaScript(
    `(() => {
      const el = document.getElementById('countdown')
      const rect = el.getBoundingClientRect()
      return {
        text: el.textContent,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        fontSize: getComputedStyle(el).fontSize,
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        body: document.body.clientWidth,
      }
    })()`,
  )
  console.log('[smoke] ball countdown', JSON.stringify(metrics))

  const image = await ballWindow.webContents.capturePage()
  const target = join(app.getPath('temp'), 'opencode-dashboard-ball.png')
  writeFileSync(target, image.toPNG())
  console.log(
    `[smoke] ball screenshot ${target} (${image.getSize().width}x${image.getSize().height})`,
  )
}

/**
 * Optional diagnostic for the one integration macOS hides: SMAppService has no
 * error channel, so `setLoginItemSettings` can be accepted and then ignored.
 * Run the packaged app with OPENCODE_DASHBOARD_LOGIN_PROBE=1 to see what this
 * machine actually does; the probe toggles through the same controller the menu
 * uses and toggles back afterwards.
 */
async function probeLoginItem(loginItem: LoginItemController): Promise<void> {
  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  const raw = () => {
    const settings = app.getLoginItemSettings()
    return { openAtLogin: settings.openAtLogin, status: settings.status }
  }

  if (!app.isPackaged) {
    console.log('[login] probe skipped: run the packaged app, not Electron.app')
    return
  }

  const before = loginItem.view()
  console.log('[login] probe before', JSON.stringify({ view: before, raw: raw() }))

  const toggled = loginItem.toggle()
  console.log('[login] probe toggled', JSON.stringify({ view: toggled, raw: raw() }))

  // SMAppService settles asynchronously; give the OS a beat before believing it.
  await delay(1_500)
  console.log('[login] probe settled', JSON.stringify(raw()))

  const restored = loginItem.toggle()
  console.log('[login] probe restored', JSON.stringify({ view: restored, raw: raw() }))
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
    // Same scheduler entry point as the tray menu's 「立即刷新」: one code path,
    // one tested cadence, and a success repaints the panel through render().
    onRetry: () => scheduler?.trigger(),
  })

  scheduler = createRefreshScheduler({
    // `refresh` already serialises requests: a tick that lands while the
    // previous one is still running is skipped rather than queued.
    onTick: (reason) => void refresh(reason),
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
  console.log('[login] startup', JSON.stringify(loginItem.view()))

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
      console.log('[login] toggled', JSON.stringify(view))
    },
    onQuit: () => app.quit(),
  })

  // Show the offline state until the first poll lands: never a made-up number.
  render(latestState)
  scheduler.start()

  if (process.env['OPENCODE_DASHBOARD_LOGIN_PROBE'] === '1') void probeLoginItem(loginItem)

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

  // Dev smoke check for headless sessions: exercises the same paths the tray
  // menu and a ball click take, logs the results, and leaves the app running
  // normally. Screen gestures (hover, drag, snap, right-click menu) still need
  // a human.
  if (!app.isPackaged && process.env['OPENCODE_DASHBOARD_SMOKE'] === '1') {
    setTimeout(() => {
      if (!tray || tray.isDestroyed()) return
      console.log('[smoke] invoking tray click path')
      togglePanel(tray.getBounds())
    }, 2_500)

    setTimeout(() => {
      console.log('[smoke] invoking tray menu refresh path')
      scheduler?.trigger()
    }, 5_000)

    setTimeout(() => {
      // Same entry point the renderer's 「重试」 button reaches over IPC.
      // Spaced out so an in-flight manual poll cannot swallow it.
      console.log('[smoke] invoking panel retry path')
      panel?.retry()
    }, 11_000)

    setTimeout(() => {
      // The tray menu's 「显示悬浮球」 callbacks, without a pointer.
      console.log('[smoke] toggling the ball on through the tray path')
      setBallVisible(true)
      console.log(`[smoke] ball visible=${ball?.isVisible()} state=${JSON.stringify(ballState)}`)
    }, 14_000)

    setTimeout(() => {
      void captureBallForSmoke()
    }, 15_500)

    setTimeout(() => {
      // A ball click: same handler the drag-end "no movement" branch calls.
      console.log('[smoke] invoking ball click -> detail panel path')
      if (ball) togglePanel(ball.bounds())
    }, 17_000)

    setTimeout(() => {
      console.log('[smoke] toggling the ball off through the tray path')
      setBallVisible(false)
      console.log(`[smoke] ball visible=${ball?.isVisible()} state=${JSON.stringify(ballState)}`)
    }, 20_000)
  }
})

app.on('before-quit', () => {
  scheduler?.stop()
  scheduler = null
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
