import assert from 'node:assert/strict'
import { test } from 'node:test'

import { derivePanelView } from '../src/core/panel-view.ts'
import type { UsageResult } from '../src/core/types.ts'
import { deriveTrayView } from '../src/core/view-model.ts'
import { LAST_SUCCESS, NOW, onlineResult } from './support/fixtures.ts'

/**
 * One row per failure the user can actually hit. `hintIncludes` is what the
 * panel must tell them to do about it; the exact wording is free to change as
 * long as the actionable word is there.
 */
const FAILURES: ReadonlyArray<{
  name: string
  state: UsageResult
  statusText: string
  hintIncludes: string[]
}> = [
  {
    name: 'service unreachable',
    state: { status: 'offline' },
    statusText: 'OpenCode 未运行',
    hintIncludes: ['OpenCode', '重试'],
  },
  {
    name: 'service up but Console not signed in',
    state: { status: 'unauthenticated' },
    statusText: '未登录 Console',
    hintIncludes: ['OpenCode', '/connect', '登录 Console', '重试'],
  },
  {
    name: 'unusable response',
    state: { status: 'error' },
    statusText: '数据异常',
    hintIncludes: ['重试'],
  },
]

for (const failure of FAILURES) {
  test(`tray shows a gray dash for ${failure.name}`, () => {
    const view = deriveTrayView({ state: failure.state, now: NOW, lastFetchedAt: LAST_SUCCESS })

    assert.equal(view.text, '—')
    assert.equal(view.level, 'muted')
    assert.ok(!view.text.includes('%'), 'no stale percentage in the menu bar')
    assert.ok(
      view.tooltip.includes('最后更新 5 分钟前'),
      'the tooltip still says how old the last numbers are',
    )
  })

  test(`panel explains ${failure.name} and offers a retry`, () => {
    const view = derivePanelView({
      state: failure.state,
      now: NOW,
      lastFetchedAt: LAST_SUCCESS,
    })

    assert.equal(view.rows, null, 'old numbers must not be shown')
    assert.equal(view.statusText, failure.statusText)
    assert.equal(view.statusHint !== null, true)
    for (const keyword of failure.hintIncludes) {
      assert.ok(
        view.statusHint?.includes(keyword),
        `hint ${JSON.stringify(view.statusHint)} should mention ${keyword}`,
      )
    }
    // Availability and copy are one field: the panel shows a button exactly
    // when core hands it a label, so they can never disagree.
    assert.equal(view.retryLabel, '重试')
    assert.equal(view.updatedAtText, '最后更新 5 分钟前')
    assert.equal(view.fetchedAt, LAST_SUCCESS)
    assert.ok(!/\d+%/.test(JSON.stringify(view)), 'no percentage leaks into a failure view')
  })
}

test('before the first poll the panel does not guess a failure reason', () => {
  const view = derivePanelView({ state: { status: 'loading' }, now: NOW, lastFetchedAt: null })

  assert.equal(view.status, 'loading')
  assert.equal(view.rows, null)
  assert.equal(view.statusText, '正在读取…')
  assert.equal(view.statusHint, null)
  assert.equal(view.retryLabel, null, 'retry waits until there is a real result')
  assert.ok(!view.statusText?.includes('未运行'))
})

test('a healthy panel has no retry button and no failure hint', () => {
  const view = derivePanelView({
    state: onlineResult({ rolling: 13, weekly: 40, monthly: 62 }, { fetchedAt: NOW }),
    now: NOW,
    lastFetchedAt: NOW,
  })

  assert.equal(view.statusText, null)
  assert.equal(view.statusHint, null)
  assert.equal(view.retryLabel, null)
  assert.deepEqual(view.rows?.map((row) => row.percent), [87, 60, 38])
})

test('未登录 is never described as 离线, and offline never asks the user to sign in', () => {
  const view = (state: UsageResult) =>
    derivePanelView({ state, now: NOW, lastFetchedAt: LAST_SUCCESS })

  const unauthenticated = view({ status: 'unauthenticated' })
  const offline = view({ status: 'offline' })
  const error = view({ status: 'error' })

  const copy = (v: ReturnType<typeof view>) => `${v.statusText ?? ''}${v.statusHint ?? ''}`
  assert.ok(!copy(unauthenticated).includes('离线'), '未登录 是登录问题，不是离线')
  assert.ok(!copy(unauthenticated).includes('未运行'), 'the service is running, so do not say 未运行')
  assert.ok(!copy(offline).includes('登录'), 'a stopped service cannot be fixed by signing in')
  assert.ok(!copy(error).includes('登录'), 'an unusable response is not a login problem')

  // Distinct reasons, so the user can tell the three failures apart.
  assert.equal(new Set([copy(unauthenticated), copy(offline), copy(error)]).size, 3)
})
