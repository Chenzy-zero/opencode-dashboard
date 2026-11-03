import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import type { PanelView } from '../core/panel-view.ts'
import type { BallView } from '../core/ball-view.ts'

/**
 * The panel renderer is sandboxed and gets plain data only. All formatting and
 * derivation happens in the Electron-free core, in the main process.
 */
const panelApi = {
  onView(callback: (view: PanelView) => void): () => void {
    const listener = (_event: IpcRendererEvent, view: PanelView): void => callback(view)
    ipcRenderer.on('panel:view', listener)
    return () => ipcRenderer.removeListener('panel:view', listener)
  },
  hide(): void {
    ipcRenderer.send('panel:hide')
  },
  /** 「重试」: ask the main process for an immediate refresh. */
  retry(): void {
    ipcRenderer.send('panel:retry')
  },
}

contextBridge.exposeInMainWorld('panelApi', panelApi)

export type PanelApi = typeof panelApi

/**
 * The floating ball is a separate window with a separate renderer, but it
 * shares this preload. Everything it needs is a message to the main process or
 * a derived view coming back.
 */
const ballApi = {
  onView(callback: (view: BallView) => void): () => void {
    const listener = (_event: IpcRendererEvent, view: BallView): void => callback(view)
    ipcRenderer.on('ball:view', listener)
    return () => ipcRenderer.removeListener('ball:view', listener)
  },
  /**
   * The main process resets the window to click-through on every show; the
   * renderer must drop its cached hover state or the two disagree and the ball
   * stops receiving clicks after being hidden.
   */
  onResetHitTest(callback: () => void): () => void {
    const listener = (): void => callback()
    ipcRenderer.on('ball:reset-hit-test', listener)
    return () => ipcRenderer.removeListener('ball:reset-hit-test', listener)
  },
  /** Click-through for the transparent corners of the ball window. */
  setIgnoreMouse(ignore: boolean): void {
    ipcRenderer.send('ball:ignore-mouse', ignore)
  },
  /** The window itself follows the cursor; the renderer only brackets the drag. */
  dragStart(): void {
    ipcRenderer.send('ball:drag-start')
  },
  dragEnd(): void {
    ipcRenderer.send('ball:drag-end')
  },
  /** Right click: 立即刷新 / 隐藏 / 退出. */
  showMenu(): void {
    ipcRenderer.send('ball:context-menu')
  },
}

contextBridge.exposeInMainWorld('ballApi', ballApi)

export type BallApi = typeof ballApi
