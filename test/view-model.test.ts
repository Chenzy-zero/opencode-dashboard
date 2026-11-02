import assert from 'node:assert/strict'
import { test } from 'node:test'

import { remainingPercent, deriveTrayView } from '../src/core/view-model.ts'
import type { UsageResult, UsageSnapshot } from '../src/core/types.ts'

function snapshot(
  used: { rolling: number; weekly: number; monthly: number },
  limited: Array<'rolling' | 'weekly' | 'monthly'> = [],
): UsageSnapshot {
  const window = (name: 'rolling' | 'weekly' | 'monthly') => ({
    percent: used[name],
    limited: limited.includes(name),
    resetsAt: 1_793_618_267_000,
  })
  return { rolling: window('rolling'), weekly: window('weekly'), monthly: window('monthly') }
}

function online(used: { rolling: number; weekly: number; monthly: number }, limited = [] as Array<'rolling' | 'weekly' | 'monthly'>): UsageResult {
  return { status: 'online', snapshot: snapshot(used, limited), fetchedAt: 1_700_000_000_000 }
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

test('menu bar shows the 5-hour window remaining allowance', () => {
  const view = deriveTrayView(online({ rolling: 13, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '87%')
  assert.equal(view.level, 'ok')
})

test('remaining above 20% is normal', () => {
  const view = deriveTrayView(online({ rolling: 79, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '21%')
  assert.equal(view.level, 'ok')
})

test('remaining of exactly 20% is yellow', () => {
  const view = deriveTrayView(online({ rolling: 80, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '20%')
  assert.equal(view.level, 'warn')
})

test('remaining of exactly 10% is yellow', () => {
  const view = deriveTrayView(online({ rolling: 90, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '10%')
  assert.equal(view.level, 'warn')
})

test('remaining below 10% is red', () => {
  const view = deriveTrayView(online({ rolling: 91, weekly: 40, monthly: 62 }))

  assert.equal(view.text, '9%')
  assert.equal(view.level, 'crit')
})

test('a rate-limited window turns the tray red even when the 5-hour window is healthy', () => {
  const view = deriveTrayView(online({ rolling: 13, weekly: 40, monthly: 62 }, ['monthly']))

  assert.equal(view.text, '87%')
  assert.equal(view.level, 'crit')
})

test('any failure state shows a gray dash and no percentage', () => {
  const failures: UsageResult[] = [
    { status: 'offline' },
    { status: 'unauthenticated' },
    { status: 'error' },
  ]

  for (const failure of failures) {
    const view = deriveTrayView(failure)
    assert.equal(view.text, '—')
    assert.equal(view.level, 'muted')
    assert.ok(!view.text.includes('%'))
  }
})

test('tooltip lists all three windows in fixed order', () => {
  const view = deriveTrayView(online({ rolling: 13, weekly: 40, monthly: 62 }))

  assert.ok(view.tooltip.includes('5 小时窗口 87%'))
  assert.ok(view.tooltip.includes('周窗口 60%'))
  assert.ok(view.tooltip.includes('月窗口 38%'))
  assert.ok(view.tooltip.indexOf('5 小时') < view.tooltip.indexOf('周窗口'))
  assert.ok(view.tooltip.indexOf('周窗口') < view.tooltip.indexOf('月窗口'))
})

