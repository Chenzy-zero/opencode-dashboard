import type { BallView } from '../core/ball-view.ts'
import type { PanelView } from '../core/panel-view.ts'

/**
 * The contract between the sandboxed renderers and the preload bridge.
 *
 * Types only: the preload bundle stays CommonJS for `sandbox: true`, and no
 * runtime module crosses into the renderer except the contextBridge objects.
 */
export type PanelApi = {
  onView: (callback: (view: PanelView) => void) => () => void
  hide: () => void
  retry: () => void
}

export type BallApi = {
  onView: (callback: (view: BallView) => void) => () => void
  onResetHitTest: (callback: () => void) => () => void
  setIgnoreMouse: (ignore: boolean) => void
  dragStart: () => void
  dragEnd: () => void
  showMenu: () => void
}
