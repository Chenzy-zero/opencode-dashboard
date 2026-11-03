import assert from 'node:assert/strict'
import { test } from 'node:test'

import { derivePanelView, formatCountdown } from '../src/core/panel-view.ts'
import type { UsageResult } from '../src/core/types.ts'
import { NOW, makeSnapshot, onlineResult } from './support/fixtures.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

test('countdown longer than a day omits the minutes', () => {
  assert.equal(formatCountdown(2 * DAY + 5 * HOUR + 13 * MINUTE), '2 天 5 小时后')
  assert.equal(formatCountdown(3 * DAY), '3 天后')
  assert.equal(formatCountdown(DAY + 30 * MINUTE), '1 天后')
})

test('countdown under a day shows hours and minutes', () => {
  assert.equal(formatCountdown(4 * HOUR + 12 * MINUTE), '4 小时 12 分后')
  assert.equal(formatCountdown(2 * HOUR), '2 小时后')
})

test('countdown under an hour shows minutes', () => {
  assert.equal(formatCountdown(43 * MINUTE), '43 分后')
  assert.equal(formatCountdown(20_000), '不到 1 分后')
})

test('each row combines a countdown with the absolute reset time', () => {
  const resetsAt = new Date(2026, 10, 2, 19, 17).getTime()
  const view = derivePanelView({
    state: onlineResult(
      { rolling: 13, weekly: 40, monthly: 62 },
      { resetsAt, fetchedAt: NOW },
    ),
    now: NOW,
    lastFetchedAt: NOW,
  })

  assert.equal(view.rows?.[0]?.resetCountdown, '2 小时 13 分后')
  assert.equal(view.rows?.[0]?.resetAbsolute, '19:17')
  assert.equal(view.rows?.[0]?.resetText, '2 小时 13 分后 · 19:17')
})

test('rows always follow the 5-hour, weekly, monthly order', () => {
  const view = derivePanelView({
    state: onlineResult({ rolling: 90, weekly: 0, monthly: 50 }, { fetchedAt: NOW }),
    now: NOW,
    lastFetchedAt: NOW,
  })

  assert.deepEqual(view.rows?.map((row) => row.key), ['rolling', 'weekly', 'monthly'])
  assert.deepEqual(view.rows?.map((row) => row.name), ['5 小时窗口', '周窗口', '月窗口'])
})

test('each row carries one percentage plus its formatted text', () => {
  const view = derivePanelView({
    state: onlineResult({ rolling: 13, weekly: 12.4, monthly: 100 }, { fetchedAt: NOW }),
    now: NOW,
    lastFetchedAt: NOW,
  })

  assert.deepEqual(view.rows?.map((row) => row.percent), [87, 88, 0])
  assert.deepEqual(view.rows?.map((row) => row.percentText), ['87%', '88%', '0%'])
  for (const row of view.rows ?? []) {
    assert.equal(
      Object.keys(row).filter((key) => key === 'percent' || key === 'percentText').length,
      2,
      'no third copy of the same number on a row',
    )
  }
})

test('a rate-limited window is marked, the others are not', () => {
  const view = derivePanelView({
    state: onlineResult(
      { rolling: 13, weekly: 40, monthly: 62 },
      { limited: ['weekly'], fetchedAt: NOW },
    ),
    now: NOW,
    lastFetchedAt: NOW,
  })

  assert.deepEqual(view.rows?.map((row) => row.limited), [false, true, false])
  assert.deepEqual(view.rows?.map((row) => row.limitedText), [null, '已限流', null])
})

test('failure states show no numbers, only the reason and last update', () => {
  const twoMinutesEarlier = NOW - 2 * MINUTE
  const failures: UsageResult[] = [
    { status: 'offline' },
    { status: 'unauthenticated' },
    { status: 'error' },
  ]

  const reasons = ['OpenCode 未运行', '未登录 Console', '数据异常']
  failures.forEach((state, index) => {
    const view = derivePanelView({ state, now: NOW, lastFetchedAt: twoMinutesEarlier })
    assert.equal(view.rows, null)
    assert.equal(view.statusText, reasons[index])
    assert.equal(view.updatedAtText, '最后更新 2 分钟前')
  })
})

test('a poll in flight shows the indicator without dropping the numbers', () => {
  const view = derivePanelView({
    state: onlineResult({ rolling: 13, weekly: 40, monthly: 62 }, { fetchedAt: NOW }),
    now: NOW,
    lastFetchedAt: NOW,
    isRefreshing: true,
  })

  assert.equal(view.isRefreshing, true)
  assert.deepEqual(view.rows?.map((row) => row.percent), [87, 60, 38])
})

test('isRefreshing defaults to false', () => {
  const view = derivePanelView({
    state: onlineResult({ rolling: 13, weekly: 40, monthly: 62 }, { fetchedAt: NOW }),
    now: NOW,
    lastFetchedAt: NOW,
  })

  assert.equal(view.isRefreshing, false)
})

test('the loading state shows the indicator and no retry', () => {
  const view = derivePanelView({
    state: { status: 'loading' },
    now: NOW,
    lastFetchedAt: null,
    isRefreshing: true,
  })

  assert.equal(view.statusText, '正在读取…')
  assert.equal(view.rows, null)
  assert.equal(view.retryLabel, null)
  assert.equal(view.isRefreshing, true)
})

test('last update text degrades from just now to minutes and hours', () => {
  const online = (fetchedAt: number) =>
    derivePanelView({
      state: onlineResult({ rolling: 13, weekly: 40, monthly: 62 }, { fetchedAt }),
      now: NOW,
      lastFetchedAt: fetchedAt,
    })

  assert.equal(online(NOW).updatedAtText, '最后更新 刚刚')
  assert.equal(online(NOW - 2 * MINUTE).updatedAtText, '最后更新 2 分钟前')
  assert.equal(online(NOW - 3 * HOUR).updatedAtText, '最后更新 3 小时前')
  assert.equal(
    derivePanelView({ state: { status: 'offline' }, now: NOW, lastFetchedAt: null }).updatedAtText,
    '尚未更新',
  )
})

// makeSnapshot is exercised through onlineResult above; this keeps the fixture
// honest about its limited/resetsAt defaults for the other test files.
test('the shared fixture defaults to no limiting', () => {
  const snapshot = makeSnapshot({ rolling: 0, weekly: 0, monthly: 0 })
  assert.equal(snapshot.rolling.limited, false)
  assert.ok(snapshot.rolling.resetsAt > 0)
})
