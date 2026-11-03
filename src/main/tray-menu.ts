import type { MenuItemConstructorOptions } from 'electron'

import type { LoginItemView } from '../core/login-item.ts'

/**
 * The tray's context menu as plain data, so its shape (order, check states,
 * whether 开机自启 can do anything here) is testable without Electron.
 */
export type TrayMenuInput = {
  ballVisible: boolean
  loginItem: LoginItemView
  onToggleBall: () => void
  onRefresh: () => void
  onToggleLoginItem: () => void
  onQuit: () => void
}

export function trayMenuTemplate(input: TrayMenuInput): MenuItemConstructorOptions[] {
  return [
    {
      label: '显示悬浮球',
      type: 'checkbox',
      checked: input.ballVisible,
      click: input.onToggleBall,
    },
    { label: '立即刷新', click: input.onRefresh },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: input.loginItem.checked,
      // Unsupported means "not packaged" (or a non-macOS/Windows host): the item
      // must not register Electron.app in the user's login items, so it stays
      // visible but inert.
      enabled: input.loginItem.supported,
      click: input.onToggleLoginItem,
    },
    // A checked box macOS ignored would be a lie; the reason sits right under
    // the item instead (pending approval, unsigned build, dev build).
    ...(input.loginItem.notice
      ? [{ label: input.loginItem.notice, enabled: false }]
      : []),
    { type: 'separator' },
    { label: '退出', click: input.onQuit },
  ]
}
