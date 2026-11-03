import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import type { PanelView } from '../core/panel-view.ts'

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
