import { app, BrowserWindow, type Tray } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { BallState } from '../core/ball-state.ts'
import type { Ball } from './ball.ts'
import type { LoginItemController } from './login-item.ts'

/**
 * Development-only harnesses, kept out of `index.ts` so the entry point reads
 * as wiring. Nothing here can run in a packaged build: the smoke harness is
 * gated on `!app.isPackaged`, and the login probe refuses to run without one.
 */
export type SmokeHarness = {
  tray: () => Tray | null
  togglePanel: (bounds: Electron.Rectangle) => void
  refresh: () => void
  retryPanel: () => void
  setBallVisible: (visible: boolean) => void
  ball: () => Ball | null
  ballState: () => BallState
}

/**
 * Dev smoke check for headless sessions: exercises the same paths the tray menu
 * and a ball click take, logs the results, and leaves the app running normally.
 * Screen gestures (hover, drag, snap, right-click menu) still need a human.
 */
export function startSmokeHarnessIfRequested(harness: SmokeHarness): void {
  if (app.isPackaged || process.env['OPENCODE_DASHBOARD_SMOKE'] !== '1') return

  setTimeout(() => {
    const tray = harness.tray()
    if (!tray || tray.isDestroyed()) return
    console.log('[smoke] invoking tray click path')
    harness.togglePanel(tray.getBounds())
  }, 2_500)

  setTimeout(() => {
    console.log('[smoke] invoking tray menu refresh path')
    harness.refresh()
  }, 5_000)

  setTimeout(() => {
    // Same entry point the renderer's 「重试」 button reaches over IPC.
    // Spaced out so an in-flight manual poll cannot swallow it.
    console.log('[smoke] invoking panel retry path')
    harness.retryPanel()
  }, 11_000)

  setTimeout(() => {
    // The tray menu's 「显示悬浮球」 callbacks, without a pointer.
    console.log('[smoke] toggling the ball on through the tray path')
    harness.setBallVisible(true)
    console.log(
      `[smoke] ball visible=${harness.ball()?.isVisible()} state=${JSON.stringify(harness.ballState())}`,
    )
  }, 14_000)

  setTimeout(() => {
    void captureBallForSmoke()
  }, 15_500)

  setTimeout(() => {
    // A ball click: same handler the drag-end "no movement" branch calls.
    console.log('[smoke] invoking ball click -> detail panel path')
    const ball = harness.ball()
    if (ball) harness.togglePanel(ball.bounds())
  }, 17_000)

  setTimeout(() => {
    console.log('[smoke] toggling the ball off through the tray path')
    harness.setBallVisible(false)
    console.log(
      `[smoke] ball visible=${harness.ball()?.isVisible()} state=${JSON.stringify(harness.ballState())}`,
    )
  }, 20_000)
}

/**
 * Prove the ball's ring and number actually painted, and that the countdown fits
 * its pill, without needing screen-recording permissions — capturePage reads the
 * renderer's own surface.
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

/** `getBounds()` is unreliable for the first ~500 ms (electron#35984). */
export function logTrayBoundsWhenDev(tray: () => Tray | null): void {
  if (app.isPackaged) return

  setTimeout(() => {
    const item = tray()
    if (item && !item.isDestroyed()) console.log('[tray] bounds', item.getBounds())
  }, 1_500)
}

/**
 * Optional diagnostic for the one integration macOS hides: SMAppService has no
 * error channel, so `setLoginItemSettings` can be accepted and then ignored.
 * Run the packaged app with OPENCODE_DASHBOARD_LOGIN_PROBE=1 to see what this
 * machine actually does; the probe toggles through the same controller the menu
 * uses and toggles back afterwards.
 */
export function runLoginProbeIfRequested(loginItem: LoginItemController): void {
  if (process.env['OPENCODE_DASHBOARD_LOGIN_PROBE'] !== '1') return

  if (!app.isPackaged) {
    console.log('[login] probe skipped: run the packaged app, not Electron.app')
    return
  }

  void (async () => {
    const delay = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms))
    const raw = () => {
      const settings = app.getLoginItemSettings()
      return { openAtLogin: settings.openAtLogin, status: settings.status }
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
  })()
}
