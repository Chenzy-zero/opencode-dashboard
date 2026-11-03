import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deriveBallView } from '../src/core/ball-view.ts'
import type { UsageResult, UsageSnapshot } from '../src/core/types.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const NOW = new Date(2026, 10, 2, 17, 4).getTime()

function online(
  used: { rolling: number; weekly: number; monthly: number },
  limited: Array<'rolling' | 'weekly' | 'monthly'> = [],
  resetsAt = NOW + 2 * HOUR + 13 * MINUTE,
): UsageResult {
  const window = (name: 'rolling' | 'weekly' | 'monthly') => ({
    percent: used[name],
    limited: limited.includes(name),
    resetsAt,
  })
  const snapshot: UsageSnapshot = {
    rolling: window('rolling'),
    weekly: window('weekly'),
    monthly: window('monthly'),
  }
  return { status: 'online', snapshot, fetchedAt: NOW }
}

test('the ball shows the 5-hour remaining allowance, its ring fill and the reset countdown', () => {
  const view = deriveBallView({ state: online({ rolling: 13, weekly: 40, monthly: 62 }), now: NOW })

  assert.equal(view.text, '87%')
  assert.equal(view.level, 'ok')
  assert.equal(view.progress, 87)
  assert.equal(view.countdown, '2 小时 13 分后')
})

test('the countdown belongs to the 5-hour window, not to the weekly or monthly one', () => {
  const state = online({ rolling: 13, weekly: 40, monthly: 62 })
  if (state.status !== 'online') throw new Error('expected an online state')

  const view = deriveBallView({
    state: {
      ...state,
      snapshot: {
        ...state.snapshot,
        rolling: { ...state.snapshot.rolling, resetsAt: NOW + 43 * MINUTE },
        weekly: { ...state.snapshot.weekly, resetsAt: NOW + 3 * 24 * HOUR },
      },
    },
    now: NOW,
  })

  assert.equal(view.countdown, '43 分后')
})

test('the ring uses the same warning tiers as the tray', () => {
  assert.equal(deriveBallView({ state: online({ rolling: 79, weekly: 0, monthly: 0 }), now: NOW }).level, 'ok')
  assert.equal(deriveBallView({ state: online({ rolling: 80, weekly: 0, monthly: 0 }), now: NOW }).level, 'warn')
  assert.equal(deriveBallView({ state: online({ rolling: 90, weekly: 0, monthly: 0 }), now: NOW }).level, 'warn')
  assert.equal(deriveBallView({ state: online({ rolling: 91, weekly: 0, monthly: 0 }), now: NOW }).level, 'crit')
})

test('any rate-limited window turns the ring and number red', () => {
  for (const limited of ['rolling', 'weekly', 'monthly'] as const) {
    const view = deriveBallView({
      state: online({ rolling: 13, weekly: 40, monthly: 62 }, [limited]),
      now: NOW,
    })

    assert.equal(view.level, 'crit', limited)
    assert.equal(view.text, '87%')
    assert.equal(view.progress, 87)
  }
})

test('non-online states show a gray dash with no arc and no countdown', () => {
  const failures: UsageResult[] = [
    { status: 'offline' },
    { status: 'unauthenticated' },
    { status: 'error' },
  ]

  for (const failure of failures) {
    const view = deriveBallView({ state: failure, now: NOW })

    assert.equal(view.status, failure.status)
    assert.equal(view.text, '—')
    assert.equal(view.level, 'muted')
    // A leftover arc would read as "some quota left" next to the dash.
    assert.equal(view.progress, 0)
    assert.equal(view.countdown, null)
    assert.ok(!view.tooltip.includes('%'))
  }
})

test('the offline tooltip names the same reason as the tray and panel', () => {
  const offline = deriveBallView({ state: { status: 'offline' }, now: NOW })
  const unauthenticated = deriveBallView({ state: { status: 'unauthenticated' }, now: NOW })

  assert.ok(offline.tooltip.includes('OpenCode 未运行'))
  assert.ok(unauthenticated.tooltip.includes('未登录 Console'))
})
