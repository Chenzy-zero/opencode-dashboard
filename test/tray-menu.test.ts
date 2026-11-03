import assert from 'node:assert/strict'
import { test } from 'node:test'

import { trayMenuTemplate, type TrayMenuInput } from '../src/main/tray-menu.ts'
import type { LoginItemView } from '../src/core/login-item.ts'

function input(
  overrides: { ballVisible?: boolean; loginItem?: Partial<LoginItemView> } = {},
): TrayMenuInput {
  return {
    ballVisible: overrides.ballVisible ?? false,
    loginItem: { supported: true, checked: false, notice: null, ...overrides.loginItem },
    onToggleBall: () => {},
    onRefresh: () => {},
    onToggleLoginItem: () => {},
    onQuit: () => {},
  }
}

function labels(items: ReturnType<typeof trayMenuTemplate>): Array<string> {
  return items.map((item) => (item.type === 'separator' ? '---' : (item.label ?? '')))
}

test('the context menu is 显示悬浮球 / 立即刷新 / 开机自启 / 退出', () => {
  assert.deepEqual(labels(trayMenuTemplate(input())), [
    '显示悬浮球',
    '立即刷新',
    '---',
    '开机自启',
    '---',
    '退出',
  ])
})

test('显示悬浮球 reflects the ball state as a checkbox', () => {
  const [ball] = trayMenuTemplate(input({ ballVisible: true }))

  assert.equal(ball?.type, 'checkbox')
  assert.equal(ball?.checked, true)
})

test('开机自启 is a checkbox showing what macOS reports', () => {
  const login = trayMenuTemplate(input({ loginItem: { supported: true, checked: true, notice: null } }))[3]

  assert.equal(login?.type, 'checkbox')
  assert.equal(login?.checked, true)
  assert.equal(login?.enabled, true)
})

test('开机自启 is inert where the OS cannot be asked', () => {
  const login = trayMenuTemplate(input({ loginItem: { supported: false, checked: false, notice: '仅打包后可用' } }))[3]

  assert.equal(login?.enabled, false)
})

test('a failed or pending login item puts its reason right under the toggle', () => {
  const items = trayMenuTemplate(
    input({ loginItem: { supported: true, checked: false, notice: '系统未接受' } }),
  )

  assert.equal(items[4]?.label, '系统未接受')
  assert.equal(items[4]?.enabled, false)
  assert.equal(items.length, 7)
  assert.equal(labels(items)[6], '退出')
})

test('no notice means no extra line', () => {
  const items = trayMenuTemplate(input())

  assert.equal(items.length, 6)
  assert.equal(labels(items)[5], '退出')
})

test('every actionable item carries its handler', () => {
  const items = trayMenuTemplate(input())

  assert.equal(typeof items[0]?.click, 'function')
  assert.equal(typeof items[1]?.click, 'function')
  assert.equal(typeof items[3]?.click, 'function')
  assert.equal(typeof items[5]?.click, 'function')
})
