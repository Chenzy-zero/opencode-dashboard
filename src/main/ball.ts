import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { join } from 'node:path'

import {
  clampToWorkArea,
  snapToNearestEdge,
  type BallGeometry,
  type ResolvedBallPosition,
} from '../core/ball-position.ts'
import type { BallView } from '../core/ball-view.ts'
import { devLog } from './log.ts'

/**
 * Window size in DIP. The renderer's CSS uses the same box, so the disc and
 * the countdown always sit inside the click-through window.
 */
export const BALL_SIZE = { width: 104, height: 104 }

/** ~60 fps cursor polling while dragging; negligible CPU, no renderer rAF. */
const DRAG_INTERVAL_MS = 16

/** Pointer travel that turns a click into a drag. */
const DRAG_THRESHOLD_PX = 3

/**
 * If pointer-up never arrives (pointer capture lost across displays, window
 * hidden mid-gesture) the drag must not follow the cursor forever.
 */
const DRAG_TIMEOUT_MS = 60_000

export type Ball = {
  show: () => void
  hide: () => void
  isVisible: () => boolean
  update: (view: BallView) => void
  /** Re-clamps onto the current display after a monitor change. */
  reclamp: () => void
  /** Current rectangle in DIP; the panel anchors to this when the ball is clicked. */
  bounds: () => Electron.Rectangle
  destroy: () => void
}

export type BallOptions = {
  /** Already resolved against the attached displays by the caller. */
  initialPosition: ResolvedBallPosition
  /** A click (not a drag): the detail panel opens next to the ball. */
  onOpenPanel: (bounds: Electron.Rectangle) => void
  /** The user dropped the ball somewhere new; persist it. */
  onGeometry: (geometry: BallGeometry) => void
  onRefresh: () => void
  /** 「隐藏」 in the ball's context menu. */
  onHide: () => void
  onQuit: () => void
}

function displayGeometry(bounds: Electron.Rectangle): BallGeometry {
  return {
    displayId: screen.getDisplayMatching(bounds).id,
    x: bounds.x,
    y: bounds.y,
  }
}

export function createBall(options: BallOptions): Ball {
  const window = new BrowserWindow({
    width: BALL_SIZE.width,
    height: BALL_SIZE.height,
    x: options.initialPosition.x,
    y: options.initialPosition.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // Transparent windows must not be resizable; we move it ourselves.
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Never steals focus from the app the user is working in.
    focusable: false,
    roundedCorners: false,
    useContentSize: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The window is unfocused and often covered: keep CSS/timers running so
      // the ring keeps animating and the hover hit-test keeps firing.
      backgroundThrottling: false,
    },
  })

  // Above full-screen apps and the Dock; the panel stays at 'pop-up-menu'.
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    // Required for an LSUIElement/accessory app; see the panel's note.
    skipTransformProcessType: true,
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Transparent pixels still swallow clicks (electron#1335), so the window
  // starts fully click-through and the renderer re-enables it while the
  // pointer is over the disc. `forward` keeps mouse-move coming through.
  window.setIgnoreMouseEvents(true, { forward: true })

  let latestView: BallView | null = null
  let rendererReady = false
  let showRequested = false
  let dragTimer: ReturnType<typeof setInterval> | null = null
  let dragTimeout: ReturnType<typeof setTimeout> | null = null
  let dragStartCursor = { x: 0, y: 0 }
  let dragStartBounds = { x: 0, y: 0, width: 0, height: 0 }
  let dragged = false

  const report = (): void => {
    options.onGeometry(displayGeometry(window.getBounds()))
  }

  const stopDrag = (): void => {
    if (dragTimeout !== null) {
      clearTimeout(dragTimeout)
      dragTimeout = null
    }
    if (dragTimer === null) return
    clearInterval(dragTimer)
    dragTimer = null
  }

  const applySnap = (): void => {
    const bounds = window.getBounds()
    const { workArea } = screen.getDisplayMatching(bounds)
    const { x, y } = snapToNearestEdge(bounds, workArea)
    // No animation: the persisted geometry must be the geometry on screen.
    window.setPosition(x, y, false)
    devLog(`[ball] snap -> ${x},${y}`)
    report()
  }

  const startDrag = (): void => {
    if (dragTimer !== null) return
    dragStartCursor = screen.getCursorScreenPoint()
    dragStartBounds = window.getBounds()
    dragged = false
    devLog('[ball] drag start')

    dragTimer = setInterval(() => {
      if (window.isDestroyed()) {
        stopDrag()
        return
      }
      // DIP and authoritative: e.screenX drifts once the window starts moving.
      const cursor = screen.getCursorScreenPoint()
      const dx = cursor.x - dragStartCursor.x
      const dy = cursor.y - dragStartCursor.y
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        dragged = true
      }
      window.setPosition(dragStartBounds.x + dx, dragStartBounds.y + dy, false)
    }, DRAG_INTERVAL_MS)

    dragTimeout = setTimeout(stopDrag, DRAG_TIMEOUT_MS)
  }

  const endDrag = (): void => {
    if (dragTimer === null) return
    stopDrag()
    devLog(`[ball] drag end (${dragged ? 'moved' : 'click'})`)

    if (!dragged) {
      // A click is "pointer went down and up without travelling": no separate
      // renderer click message that could disagree with the drag threshold.
      options.onOpenPanel(window.getBounds())
      return
    }

    applySnap()
  }

  const hide = (): void => {
    showRequested = false
    // Losing the pointer mid-drag would otherwise let the ball keep moving.
    stopDrag()
    if (window.isDestroyed() || !window.isVisible()) return
    window.hide()
    // Keep the saved position truthful even if the ball was hidden mid-drag.
    report()
    devLog('[ball] hide')
  }

  const showNow = (): void => {
    if (window.isDestroyed() || window.isVisible()) return
    // Reset the hit-test: the pointer is usually over the tray menu, not the
    // ball, so the window must be click-through until it moves onto the disc.
    window.setIgnoreMouseEvents(true, { forward: true })
    // Keep the renderer's cached hover state in step with the reset above.
    if (rendererReady) window.webContents.send('ball:reset-hit-test')
    // showInactive plus focusable:false: appearing never steals the keystroke.
    window.showInactive()
    const { x, y } = window.getBounds()
    devLog(`[ball] show at ${x},${y}`)
  }

  const show = (): void => {
    showRequested = true
    // Restoring a saved "visible" must not flash an empty window before the
    // renderer has drawn the ring.
    if (!rendererReady) {
      devLog('[ball] show deferred until the renderer is ready')
      return
    }
    showNow()
  }

  const onIgnoreMouse = (_event: Electron.IpcMainEvent, ignore: boolean): void => {
    if (window.isDestroyed()) return
    window.setIgnoreMouseEvents(ignore === true, { forward: true })
  }

  const onDragStart = (): void => startDrag()
  const onDragEnd = (): void => endDrag()

  const menu = Menu.buildFromTemplate([
    { label: '立即刷新', click: () => options.onRefresh() },
    { type: 'separator' },
    { label: '隐藏', click: () => options.onHide() },
    { label: '退出', click: () => options.onQuit() },
  ])

  const onContextMenu = (): void => {
    if (dragTimer !== null) return
    devLog('[ball] context menu')
    menu.popup({ window })
  }

  ipcMain.on('ball:ignore-mouse', onIgnoreMouse)
  ipcMain.on('ball:drag-start', onDragStart)
  ipcMain.on('ball:drag-end', onDragEnd)
  ipcMain.on('ball:context-menu', onContextMenu)

  const sendLatest = (): void => {
    if (!latestView || window.webContents.isDestroyed()) return
    window.webContents.send('ball:view', latestView)
  }

  window.webContents.on('did-finish-load', () => {
    devLog('[ball] renderer loaded')
    rendererReady = true
    sendLatest()
    if (showRequested) showNow()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void window.loadURL(`${devUrl}/ball.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/ball.html'))
  }

  devLog(`[ball] window created at ${options.initialPosition.x},${options.initialPosition.y}`)

  return {
    show,
    hide,

    isVisible() {
      return !window.isDestroyed() && window.isVisible()
    },

    update(view) {
      latestView = view
      sendLatest()
    },

    reclamp() {
      if (window.isDestroyed()) return
      const bounds = window.getBounds()
      const { workArea } = screen.getDisplayMatching(bounds)
      const { x, y } = clampToWorkArea(bounds, BALL_SIZE, workArea)
      if (x !== bounds.x || y !== bounds.y) {
        devLog(`[ball] reclamp ${bounds.x},${bounds.y} -> ${x},${y}`)
        window.setPosition(x, y, false)
        report()
      }
    },

    bounds() {
      return window.getBounds()
    },

    destroy() {
      stopDrag()
      ipcMain.removeListener('ball:ignore-mouse', onIgnoreMouse)
      ipcMain.removeListener('ball:drag-start', onDragStart)
      ipcMain.removeListener('ball:drag-end', onDragEnd)
      ipcMain.removeListener('ball:context-menu', onContextMenu)
      if (!window.isDestroyed()) window.destroy()
    },
  }
}
