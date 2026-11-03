import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveTrayView,
  fiveHourSummary,
  remainingPercent,
} from '../src/core/view-model.ts'
import type { UsageResult } from '../src/core/types.ts'
import { LAST_SUCCESS, MINUTE, NOW, makeSnapshot, onlineResult } from './support/fixtures.ts'

function tray(state: UsageResult | { status: 'loading' }, lastFetchedAt: number | null = null) {
  return deriveTrayView({ state, now: NOW, lastFetchedAt })
}

test('remaining allowance is 100 minus the used percentage', () => {
  assert.equal(remainingPercent(13), 87)
  assert.equal(remainingPercent(0), 100)
  assert.equal(remainingPercent(100), 0)
})

test('remaining allowance rounds to a whole percent', () => {
  assert.equal(remainingPercent(12.4), 88)
  assert.equal(remainingPercent(12.6), 87)
  assert.equal(remainingPercent(87.5), 13)
})

test('the tray and the ball share one 5-hour summary', () => {
  const healthy = fiveHourSummary(makeSnapshot({ rolling: 13, weekly: 40, monthly: 62 }))
  assert.deepEqual(healthy, { remaining: 87, anyLimited: false })

  const limitedElsewhere = fiveHourSummary(
    makeSnapshot({ rolling: 13, weekly: 40, monthly: 62 }, { limited: ['monthly'] }),
  )
  assert.deepEqual(limitedElsewhere, { remaining: 87, anyLimited: true })
})

test('menu bar shows the 5-hour window remaining allowance', () => {
  const view = tray(onlineResult({ rolling: 13, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '87%')
  assert.equal(view.level, 'ok')
})

test('remaining above 20% is normal', () => {
  const view = tray(onlineResult({ rolling: 79, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '21%')
  assert.equal(view.level, 'ok')
})

test('remaining of exactly 20% is yellow', () => {
  const view = tray(onlineResult({ rolling: 80, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '20%')
  assert.equal(view.level, 'warn')
})

test('remaining of exactly 10% is yellow', () => {
  const view = tray(onlineResult({ rolling: 90, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '10%')
  assert.equal(view.level, 'warn')
})

test('remaining below 10% is red', () => {
  const view = tray(onlineResult({ rolling: 91, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '9%')
  assert.equal(view.level, 'crit')
})

test('a rate-limited window turns the tray red even when the 5-hour window is healthy', () => {
  const view = tray(onlineResult({ rolling: 13, weekly: 40, monthly: 62 }, { limited: ['monthly'] }))

  assert.equal(view.text, '87%')
  assert.equal(view.level, 'crit')
})

test('before the first poll settles the tray is neutral, not a failure', () => {
  const view = tray({ status: 'loading' })

  assert.equal(view.text, '…')
  assert.equal(view.level, 'muted')
  assert.ok(view.tooltip.includes('正在读取'))
  assert.ok(!view.tooltip.includes('未运行'), 'no failure reason before a settled fetch')
})

test('any failure state shows a gray dash and no percentage', () => {
  const failures: UsageResult[] = [
    { status: 'offline' },
    { status: 'unauthenticated' },
    { status: 'error' },
  ]

  for (const failure of failures) {
    const view = tray(failure)
    assert.equal(view.text, '—')
    assert.equal(view.level, 'muted')
    assert.ok(!view.text.includes('%'))
  }
})

test('a failure tooltip keeps the last update time without showing a percentage', () => {
  const view = tray({ status: 'offline' }, NOW - 2 * MINUTE)

  assert.ok(view.tooltip.includes('OpenCode 未运行'))
  assert.ok(view.tooltip.includes('最后更新 2 分钟前'))
  assert.ok(!view.tooltip.includes('%'), 'old numbers must not survive a failure')
})

test('the loading tooltip can still say how old the last fetch was', () => {
  const view = tray({ status: 'loading' }, LAST_SUCCESS)

  assert.ok(view.tooltip.includes('正在读取'))
  assert.ok(view.tooltip.includes('最后更新 5 分钟前'))
})

test('tooltip lists all three windows in fixed order and the last update', () => {
  const view = tray(onlineResult({ rolling: 13, weekly: 40, monthly: 62 }, { fetchedAt: NOW }))

  assert.ok(view.tooltip.includes('5 小时窗口 87%'))
  assert.ok(view.tooltip.includes('周窗口 60%'))
  assert.ok(view.tooltip.includes('月窗口 38%'))
  assert.ok(view.tooltip.includes('最后更新 刚刚'))
  assert.ok(view.tooltip.indexOf('5 小时') < view.tooltip.indexOf('周窗口'))
  assert.ok(view.tooltip.indexOf('周窗口') < view.tooltip.indexOf('月窗口'))
  assert.ok(view.tooltip.indexOf('月窗口') < view.tooltip.indexOf('最后更新'))
})
