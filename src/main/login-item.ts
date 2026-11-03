import {
  deriveLoginItemView,
  loginItemNotice,
  type LoginItemContext,
  type LoginItemSettings,
  type LoginItemView,
} from '../core/login-item.ts'

/**
 * Everything the 「开机自启」 item needs, with the OS behind a port so the toggle
 * can be exercised without Electron. The controller never trusts its own write:
 * every read goes back to the OS, because `setLoginItemSettings` has no error
 * channel (an unsigned bundle can be ignored in silence).
 */
export type LoginItemPort = LoginItemContext & {
  read: () => LoginItemSettings
  write: (openAtLogin: boolean) => void
}

export type LoginItemController = {
  /** Fresh state for building the menu; never cached, the OS is the truth. */
  view: () => LoginItemView
  /** Flips the item and returns the state the OS reports afterwards. */
  toggle: () => LoginItemView
}

export function createLoginItemController(port: LoginItemPort): LoginItemController {
  // What the user last asked for. Kept so a write the OS dropped can be named as
  // such, instead of looking like the box simply sprang back.
  let lastRequested: boolean | null = null

  const view = (): LoginItemView => {
    const observed = deriveLoginItemView(port.read(), port)
    return { ...observed, notice: loginItemNotice(observed, lastRequested) }
  }

  return {
    view,

    toggle() {
      const before = view()
      if (!before.supported) return before

      lastRequested = !before.checked
      port.write(lastRequested)
      return view()
    },
  }
}
