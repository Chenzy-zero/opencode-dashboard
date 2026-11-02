import { Menu, Tray, nativeImage } from 'electron'

import type { TrayView } from '../core/view-model.ts'

/**
 * Stable identity so macOS keeps the item in the same menu-bar slot across
 * relaunches (Electron Tray guid, macOS).
 */
const TRAY_GUID = '7d0f3c9a-2b4e-4c61-8f5a-9e6b1d2c4a70'

/** ANSI foreground colours are rendered by macOS status-item titles. */
const TITLE_COLOUR: Partial<Record<TrayView['level'], string>> = {
  warn: '\u001b[33m',
  crit: '\u001b[31m',
  muted: '\u001b[90m',
}

export type TrayHandlers = {
  iconPath: string
  /** Left click: the tray icon is the panel's toggle. */
  onToggle: (bounds: Electron.Rectangle) => void
  onRefresh: () => void
  onQuit: () => void
}

export function titleFor(view: TrayView): string {
  const colour = TITLE_COLOUR[view.level]
  return colour ? `${colour}${view.text}\u001b[0m` : view.text
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(handlers.iconPath)
  if (icon.isEmpty()) {
    throw new Error(`tray icon not found at ${handlers.iconPath}`)
  }
  // The file name already ends in "Template"; set it explicitly so a future
  // rename cannot silently turn the icon into a coloured (non-adapting) one.
  icon.setTemplateImage(true)

  const tray = new Tray(icon, TRAY_GUID)
  tray.setIgnoreDoubleClickEvents(true)
  tray.setToolTip('OpenCode Dashboard')

  // Do not attach this with setContextMenu(): on macOS that makes the menu
  // open on left click too and swallows the click-toggled panel. Right click
  // pops the menu explicitly instead.
  const menu = Menu.buildFromTemplate([
    { label: '立即刷新', click: handlers.onRefresh },
    { type: 'separator' },
    { label: '退出 OpenCode Dashboard', click: handlers.onQuit },
  ])
  tray.on('click', (_event, bounds) => handlers.onToggle(bounds))
  tray.on('right-click', () => tray.popUpContextMenu(menu))
  console.log('[tray] click toggles the detail panel; right click opens the menu')

  return tray
}

/** Applies a derived view to the menu-bar item. Only this shell knows colours. */
export function applyTrayView(tray: Tray, view: TrayView): void {
  tray.setTitle(titleFor(view), { fontType: 'monospacedDigit' })
  tray.setToolTip(view.tooltip)
}
