/**
 * Login-item state for the 「开机自启」 menu item, with no Electron import so the
 * rules stay unit-testable.
 *
 * macOS 13+ registers login items through SMAppService, and Electron's own docs
 * warn that an app must be packaged, signed and notarized for this to work
 * reliably. `setLoginItemSettings` therefore has no error channel: the only way
 * to know what happened is to read the settings back. Everything here is about
 * showing what the OS reports instead of what we asked for.
 */

export type LoginItemStatus = 'not-registered' | 'enabled' | 'requires-approval' | 'not-found'

/** The subset of `app.getLoginItemSettings()` this app depends on. */
export type LoginItemSettings = {
  openAtLogin: boolean
  /** macOS only (SMAppService). Absent on Windows and in older Electron. */
  status?: LoginItemStatus
}

export type LoginItemContext = {
  packaged: boolean
  platform: string
}

export type LoginItemView = {
  /** Whether the toggle can do anything at all here. */
  supported: boolean
  /** What the checkbox shows: the state the OS reports, never the wish. */
  checked: boolean
  /** Why the checkbox cannot be trusted, or where to finish the job. */
  notice: string | null
}

const NOTICE_DEV = '开机自启仅对打包后的应用生效'
const NOTICE_PLATFORM = '当前系统不支持开机自启'
const NOTICE_APPROVAL = '需在「系统设置 › 通用 › 登录项」中允许'
const NOTICE_NOT_REGISTERED = '系统未接受开机自启设置（未签名构建常见）'
const NOTICE_MISMATCH = '开机自启未能生效（未签名构建常见）'

/** Derives what the menu should show from what the OS currently reports. */
export function deriveLoginItemView(
  settings: LoginItemSettings,
  context: LoginItemContext,
): LoginItemView {
  if (context.platform !== 'darwin' && context.platform !== 'win32') {
    return { supported: false, checked: false, notice: NOTICE_PLATFORM }
  }

  // In dev the "app" is Electron.app; registering that would add Electron to the
  // user's login items, so the toggle stays inert until packaging.
  if (!context.packaged) {
    return { supported: false, checked: false, notice: NOTICE_DEV }
  }

  if (context.platform === 'win32') {
    return { supported: true, checked: settings.openAtLogin, notice: null }
  }

  switch (settings.status) {
    case 'enabled':
      return { supported: true, checked: true, notice: null }
    case 'requires-approval':
      // Registered, waiting for the user in System Settings: the checkmark is
      // honest, the notice says what is still missing.
      return { supported: true, checked: settings.openAtLogin, notice: NOTICE_APPROVAL }
    case 'not-registered':
    case 'not-found':
      return {
        supported: true,
        checked: false,
        notice: settings.openAtLogin ? NOTICE_NOT_REGISTERED : null,
      }
    default:
      // Electron without a status (pre-SMAppService): the request is all we have.
      return { supported: true, checked: settings.openAtLogin, notice: null }
  }
}

/**
 * Notice to show after a toggle: when the checkbox did not end up where the
 * user asked, say so instead of silently springing back.
 */
export function loginItemNotice(view: LoginItemView, lastRequested: boolean | null): string | null {
  if (view.notice) return view.notice
  if (lastRequested !== null && lastRequested !== view.checked) return NOTICE_MISMATCH
  return null
}
