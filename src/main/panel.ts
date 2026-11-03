import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'

import { panelPosition } from '../core/panel-position.ts'
import type { PanelView } from '../core/panel-view.ts'
import { devLog } from './log.ts'

/** Frameless popover: three fixed rows never wrap at this width. */
const PANEL_SIZE = { width: 340, height: 300 }

/**
 * Clicking the tray while the panel is open hides it via `blur` first; the
 * click that follows must not immediately re-show it. 250 ms is the guard
 * from the setup notes.
 */
const BLUR_GUARD_MS = 250

/** Countdown text only changes per minute; re-derive twice a minute. */
const TICK_MS = 30_000

export type Panel = {
  /** Toggles from the tray icon. `anchor` is the tray's screen rectangle. */
  toggle: (anchor: Electron.Rectangle) => void
  hide: () => void
  update: (view: PanelView) => void
  /** What the 「重试」 button does: one immediate refresh, no window changes. */
  retry: () => void
  destroy: () => void
}

export type PanelOptions = {
  /** Called after the panel becomes visible, e.g. to refresh and repaint. */
  onShow: () => void
  /** Called periodically while visible so countdowns never go stale. */
  onTick: () => void
  /** 重试: shared with the tray menu's 「立即刷新」 in main/index.ts. */
  onRetry: () => void
}

export function createPanel(options: PanelOptions): Panel {
  const panel = new BrowserWindow({
    width: PANEL_SIZE.width,
    height: PANEL_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: false,
    useContentSize: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  // Above the Dock but below the screen saver; the ball (#6) will go higher.
  panel.setAlwaysOnTop(true, 'pop-up-menu')
  // skipTransformProcessType matters for an LSUIElement/accessory app.
  panel.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  devLog('[panel] window created')

  let latestView: PanelView | null = null
  let lastHiddenAt = 0
  let ticker: ReturnType<typeof setInterval> | null = null

  const stopTicker = (): void => {
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  const startTicker = (): void => {
    stopTicker()
    ticker = setInterval(options.onTick, TICK_MS)
  }

  const hide = (reason: 'api' | 'blur' | 'tray'): void => {
    if (!panel.isVisible()) return
    panel.hide()
    devLog(`[panel] hide (${reason})`)
  }

  panel.on('hide', () => {
    // Single place for hide bookkeeping, including hides initiated by macOS
    // (Space switch, Cmd+Tab, ...). The timestamp feeds the blur guard.
    stopTicker()
    lastHiddenAt = Date.now()
  })

  panel.on('blur', () => {
    // Opening DevTools blurs the panel; hiding then would make it unusable.
    if (panel.webContents.isDevToolsOpened()) return
    hide('blur')
  })

  panel.on('closed', stopTicker)

  const sendLatest = (): void => {
    if (!latestView || panel.webContents.isDestroyed()) return
    panel.webContents.send('panel:view', latestView)
  }

  panel.webContents.on('did-finish-load', () => {
    devLog('[panel] renderer loaded')
    sendLatest()
  })

  const onHideRequest = (): void => hide('api')
  ipcMain.on('panel:hide', onHideRequest)

  // 重试 is the only write the panel renderer can cause, and it is the same
  // action as the tray menu's 「立即刷新」. The result is pushed back through
  // the ordinary render path once the poll settles.
  const requestRetry = (): void => {
    devLog('[panel] retry requested')
    options.onRetry()
  }
  ipcMain.on('panel:retry', requestRetry)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void panel.loadURL(devUrl)
  } else {
    void panel.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return {
    toggle(anchor) {
      // The click that follows a blur-hide is swallowed here.
      if (Date.now() - lastHiddenAt < BLUR_GUARD_MS) return

      if (panel.isVisible()) {
        hide('tray')
        return
      }

      const { workArea } = screen.getDisplayMatching(anchor)
      const { x, y } = panelPosition(anchor, PANEL_SIZE, workArea)
      panel.setPosition(x, y, false)
      // show() + focus() (not showInactive): a non-key window never blurs, so
      // the panel would never auto-dismiss.
      panel.show()
      panel.focus()
      startTicker()
      devLog(`[panel] show at ${x},${y}`)
      options.onShow()
    },

    hide: () => hide('api'),

    retry: requestRetry,

    update(view) {
      latestView = view
      const rows = view.rows ? view.rows.length : 0
      devLog(`[panel] update status=${view.status} rows=${rows}`)
      sendLatest()
    },

    destroy() {
      stopTicker()
      ipcMain.removeListener('panel:hide', onHideRequest)
      ipcMain.removeListener('panel:retry', requestRetry)
      if (!panel.isDestroyed()) panel.destroy()
    },
  }
}
