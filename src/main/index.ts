import { app, type Tray } from 'electron'
import { join } from 'node:path'

import { readUsage } from '../core/usage.ts'
import { deriveTrayView } from '../core/view-model.ts'
import { applyTrayView, createTray } from './tray.ts'

app.setName('OpenCode Dashboard')

/** v1 constant; the scheduler gets its own tested home in #4. */
const POLL_INTERVAL_MS = 60_000

let tray: Tray | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false

function trayIconPath(): string {
  // electron-vite runs main from out/main in dev; packaged builds copy the
  // resources via electron-builder's extraResources.
  return app.isPackaged
    ? join(process.resourcesPath, 'trayTemplate.png')
    : join(__dirname, '../../resources/trayTemplate.png')
}

function render(state: Parameters<typeof deriveTrayView>[0]): void {
  if (!tray || tray.isDestroyed()) return
  const view = deriveTrayView(state)
  applyTrayView(tray, view)
  if (!app.isPackaged) {
    // Development breadcrumb: what the menu bar should now show.
    console.log(`[tray] title=${JSON.stringify(view.text)} level=${view.level}`)
  }
}

async function refresh(reason: 'startup' | 'manual' | 'interval'): Promise<void> {
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

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory')
  }

  tray = createTray({
    iconPath: trayIconPath(),
    onRefresh: () => void refresh('manual'),
    onQuit: () => app.quit(),
  })

  // Show the offline state until the first poll lands: never a made-up number.
  render({ status: 'offline' })
  void refresh('startup')

  if (!app.isPackaged) {
    // getBounds() is unreliable for the first ~500 ms (electron#35984); read it
    // once later as a launch check that macOS really placed a status item.
    setTimeout(() => {
      if (tray && !tray.isDestroyed()) console.log('[tray] bounds', tray.getBounds())
    }, 1_500)
  }

  pollTimer = setInterval(() => void refresh('interval'), POLL_INTERVAL_MS)
})

app.on('before-quit', () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
