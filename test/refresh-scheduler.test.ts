import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRefreshScheduler, type RefreshReason } from '../src/core/refresh-scheduler.ts'
import { createFakeClock } from './support/fake-clock.ts'

type Tick = { reason: RefreshReason; at: number }

function record(ticks: Tick[]): (reason: RefreshReason, at: number) => void {
  return (reason, at) => ticks.push({ reason, at })
}

test('refreshes on start and then every 60 seconds', () => {
  const fake = createFakeClock()
  const ticks: Tick[] = []
  const scheduler = createRefreshScheduler({ clock: fake.clock, onTick: record(ticks) })

  scheduler.start()
  assert.deepEqual(ticks, [{ reason: 'startup', at: 0 }])

  fake.advance(59_999)
  assert.equal(ticks.length, 1, 'nothing fires before the 60 s mark')

  fake.advance(1)
  assert.deepEqual(ticks[1], { reason: 'interval', at: 60_000 })

  fake.advance(60_000)
  assert.deepEqual(ticks[2], { reason: 'interval', at: 120_000 })
})

test('manual refresh fires immediately without disturbing the 60 s cadence', () => {
  const fake = createFakeClock()
  const ticks: Tick[] = []
  const scheduler = createRefreshScheduler({ clock: fake.clock, onTick: record(ticks) })

  scheduler.start()
  fake.advance(10_000)
  scheduler.trigger()

  assert.deepEqual(ticks.at(-1), { reason: 'manual', at: 10_000 })

  fake.advance(49_999)
  assert.equal(ticks.length, 2, 'the manual refresh did not reset the timer')

  fake.advance(1)
  assert.deepEqual(ticks.at(-1), { reason: 'interval', at: 60_000 })
})

test('waking refreshes immediately and restarts the cadence from the wake', () => {
  const fake = createFakeClock()
  const ticks: Tick[] = []
  const scheduler = createRefreshScheduler({ clock: fake.clock, onTick: record(ticks) })

  scheduler.start()
  // While suspended, wall time moves but the timer does not fire.
  fake.sleep(5 * 60_000)
  scheduler.notifyWake()

  assert.deepEqual(ticks.at(-1), { reason: 'wake', at: 300_000 })

  fake.advance(59_999)
  assert.equal(ticks.length, 2, 'the overdue pre-sleep timer did not double-fire')

  fake.advance(1)
  assert.deepEqual(ticks.at(-1), { reason: 'interval', at: 360_000 })
})

test('stopping cancels the timer and ignores later triggers', () => {
  const fake = createFakeClock()
  const ticks: Tick[] = []
  const scheduler = createRefreshScheduler({ clock: fake.clock, onTick: record(ticks) })

  scheduler.start()
  scheduler.stop()

  assert.equal(fake.pendingTimers(), 0)

  fake.advance(120_000)
  scheduler.trigger()
  scheduler.notifyWake()

  assert.deepEqual(ticks, [{ reason: 'startup', at: 0 }])
})
