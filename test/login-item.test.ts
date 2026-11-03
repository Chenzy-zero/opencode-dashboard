import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveLoginItemView,
  loginItemNotice,
  type LoginItemSettings,
} from '../src/core/login-item.ts'

const PACKAGED_MAC = { packaged: true, platform: 'darwin' } as const
const DEV_MAC = { packaged: false, platform: 'darwin' } as const

function settings(overrides: Partial<LoginItemSettings> = {}): LoginItemSettings {
  return { openAtLogin: false, status: 'not-registered', ...overrides }
}

test('an app registered by macOS shows a checked 开机自启', () => {
  const view = deriveLoginItemView(
    settings({ openAtLogin: true, status: 'enabled' }),
    PACKAGED_MAC,
  )

  assert.equal(view.supported, true)
  assert.equal(view.checked, true)
  assert.equal(view.notice, null)
})

test('a logged-in-launch that the user turned off shows an unchecked 开机自启', () => {
  const view = deriveLoginItemView(settings(), PACKAGED_MAC)

  assert.equal(view.supported, true)
  assert.equal(view.checked, false)
  assert.equal(view.notice, null)
})

test('pending approval keeps the checkmark but says where to approve', () => {
  const view = deriveLoginItemView(
    settings({ openAtLogin: true, status: 'requires-approval' }),
    PACKAGED_MAC,
  )

  assert.equal(view.checked, true)
  assert.ok(view.notice?.includes('登录项'), `expected a 登录项 hint, got ${view.notice}`)
  assert.ok(view.notice?.includes('系统设置'))
})

test('a request macOS never registered does not show a checked box', () => {
  const view = deriveLoginItemView(
    settings({ openAtLogin: true, status: 'not-registered' }),
    PACKAGED_MAC,
  )

  assert.equal(view.checked, false)
  assert.ok(view.notice, 'a silent failure must be surfaced')
  assert.ok(view.notice.includes('未签名'), `expected the unsigned caveat, got ${view.notice}`)
})

test('an unknown login item is treated as not registered', () => {
  const view = deriveLoginItemView(
    settings({ openAtLogin: true, status: 'not-found' }),
    PACKAGED_MAC,
  )

  assert.equal(view.checked, false)
  assert.ok(view.notice)
})

test('the dev build never offers to register Electron.app as a login item', () => {
  const view = deriveLoginItemView(
    settings({ openAtLogin: false, status: 'not-registered' }),
    DEV_MAC,
  )

  assert.equal(view.supported, false)
  assert.equal(view.checked, false)
  assert.ok(view.notice?.includes('打包'), `expected a packaging hint, got ${view.notice}`)
})

test('Windows has no SMAppService status, so the requested state is the truth', () => {
  const view = deriveLoginItemView(
    { openAtLogin: true },
    { packaged: true, platform: 'win32' },
  )

  assert.equal(view.supported, true)
  assert.equal(view.checked, true)
  assert.equal(view.notice, null)
})

test('an unsupported platform offers no toggle', () => {
  const view = deriveLoginItemView(settings(), { packaged: true, platform: 'linux' })

  assert.equal(view.supported, false)
  assert.equal(view.checked, false)
})

test('a toggle macOS ignored produces a failure notice', () => {
  const observed = deriveLoginItemView(settings(), PACKAGED_MAC)

  const notice = loginItemNotice(observed, true)

  assert.ok(notice)
  assert.ok(notice.includes('未签名'), `expected the unsigned caveat, got ${notice}`)
})

test('a toggle macOS honoured produces no notice', () => {
  const observed = deriveLoginItemView(settings(), PACKAGED_MAC)

  assert.equal(loginItemNotice(observed, false), null)
})

test('before the first toggle there is nothing to complain about', () => {
  const observed = deriveLoginItemView(settings(), PACKAGED_MAC)

  assert.equal(loginItemNotice(observed, null), null)
})

test('pending approval outranks the mismatch notice', () => {
  const observed = deriveLoginItemView(
    settings({ openAtLogin: true, status: 'requires-approval' }),
    PACKAGED_MAC,
  )

  assert.equal(loginItemNotice(observed, true), observed.notice)
})
