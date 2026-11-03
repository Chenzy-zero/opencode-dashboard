import assert from 'node:assert/strict'
import { setImmediate as tick } from 'node:timers/promises'
import { test } from 'node:test'

import { createRefreshRunner } from '../src/core/refresh-runner.ts'
import type { RefreshReason } from '../src/core/refresh-scheduler.ts'
import type { UsageResult } from '../src/core/types.ts'
import { onlineResult } from './support/fixtures.ts'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const ONLINE = onlineResult({ rolling: 13, weekly: 40, monthly: 62 })

test('a manual trigger during an in-flight poll becomes one queued follow-up', async () => {
  const fetches: Deferred<UsageResult>[] = []
  const results: Array<{ status: UsageResult['status']; reason: RefreshReason }> = []
  const changes: boolean[] = []

  const runner = createRefreshRunner({
    refresh: () => {
      const pending = deferred<UsageResult>()
      fetches.push(pending)
      return pending.promise
    },
    onResult: (result, reason) => results.push({ status: result.status, reason }),
    onChange: (refreshing) => changes.push(refreshing),
  })

  runner.run('manual')
  assert.equal(runner.isRefreshing(), true)
  assert.equal(fetches.length, 1, 'no overlapping request')

  // Two clicks while the first fetch is slow. The user must not be ignored,
  // but a burst must not become a burst of requests either.
  runner.run('manual')
  runner.run('wake')
  assert.equal(fetches.length, 1)
  assert.equal(runner.isRefreshing(), true)

  fetches[0]?.resolve(ONLINE)
  await tick()

  assert.equal(results.length, 1)
  assert.equal(fetches.length, 2, 'the click produced a visible follow-up refresh')
  assert.equal(runner.isRefreshing(), true, 'still refreshing during the queued fetch')

  fetches[1]?.resolve({ status: 'offline' })
  await tick()

  assert.deepEqual(results, [
    { status: 'online', reason: 'manual' },
    { status: 'offline', reason: 'wake' },
  ])
  assert.equal(runner.isRefreshing(), false)
  assert.equal(changes.at(-1), false)
})

test('a refresh that throws becomes an error result and does not wedge the queue', async () => {
  let attempts = 0
  const results: UsageResult[] = []
  const errors: unknown[] = []

  const runner = createRefreshRunner({
    refresh: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('boom')
      return ONLINE
    },
    onResult: (result) => results.push(result),
    onError: (error) => errors.push(error),
  })

  runner.run('startup')
  await tick()

  assert.equal(errors.length, 1)
  assert.deepEqual(results, [{ status: 'error' }])
  assert.equal(runner.isRefreshing(), false)

  runner.run('manual')
  await tick()

  assert.equal(results.at(-1)?.status, 'online')
  assert.equal(runner.isRefreshing(), false)
})
