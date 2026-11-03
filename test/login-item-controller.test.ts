import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createLoginItemController, type LoginItemPort } from '../src/main/login-item.ts'
import type { LoginItemSettings } from '../src/core/login-item.ts'

/**
 * A fake OS: the controller may only observe what `getLoginItemSettings`
 * reports, which is what makes the checkbox honest. `honours` models the
 * unsigned-build failure mode where the write is accepted silently and nothing
 * registers.
 */
function fakeSystem(
  initial: LoginItemSettings,
  options: { honours?: boolean } = {},
): LoginItemPort & { writes: boolean[]; settings: LoginItemSettings } {
  const system = {
    settings: { ...initial },
    writes: [] as boolean[],
    packaged: true,
    platform: 'darwin',
    read: () => ({ ...system.settings }),
    write: (openAtLogin: boolean) => {
      system.writes.push(openAtLogin)
      if (options.honours === false) return
      system.settings = {
        openAtLogin,
        status: openAtLogin ? 'enabled' : 'not-registered',
      }
    },
  }
  return system
}

test('turning 开机自启 on registers the app and shows a checked box', () => {
  const system = fakeSystem({ openAtLogin: false, status: 'not-registered' })
  const loginItem = createLoginItemController(system)

  const view = loginItem.toggle()

  assert.deepEqual(system.writes, [true])
  assert.equal(view.checked, true)
  assert.equal(view.notice, null)
})

test('turning 开机自启 off unregisters the app and clears the box', () => {
  const system = fakeSystem({ openAtLogin: true, status: 'enabled' })
  const loginItem = createLoginItemController(system)

  const view = loginItem.toggle()

  assert.deepEqual(system.writes, [false])
  assert.equal(view.checked, false)
  assert.equal(view.notice, null)
})

test('a login item the OS refuses to register does not show a checked box', () => {
  const system = fakeSystem({ openAtLogin: false, status: 'not-registered' }, { honours: false })
  const loginItem = createLoginItemController(system)

  const view = loginItem.toggle()

  assert.deepEqual(system.writes, [true])
  assert.equal(view.checked, false)
  assert.ok(view.notice, 'the silent failure must be visible in the menu')
})

test('dev builds never write to the OS login items', () => {
  const system = { ...fakeSystem({ openAtLogin: false, status: 'not-registered' }), packaged: false }
  const loginItem = createLoginItemController(system)

  const view = loginItem.toggle()

  assert.deepEqual(system.writes, [])
  assert.equal(view.supported, false)
})

test('the failure notice clears once macOS reports the item as enabled', () => {
  const system = fakeSystem({ openAtLogin: false, status: 'not-registered' }, { honours: false })
  const loginItem = createLoginItemController(system)

  assert.ok(loginItem.toggle().notice)
  // The user finishes the job in System Settings › Login Items.
  system.settings = { openAtLogin: true, status: 'enabled' }

  const view = loginItem.view()

  assert.equal(view.checked, true)
  assert.equal(view.notice, null)
})
