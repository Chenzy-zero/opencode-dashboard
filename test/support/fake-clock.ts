import type { RefreshClock } from '../../src/core/refresh-scheduler.ts'

export type FakeClock = {
  clock: RefreshClock
  /** Moves wall time forward, running every timer that comes due. */
  advance: (ms: number) => void
  /** Moves wall time forward without running timers, like a suspended machine. */
  sleep: (ms: number) => void
  pendingTimers: () => number
}

/**
 * A deterministic clock for the refresh scheduler. Timers fire in due order as
 * `advance` walks the fake wall clock, so tests read like the real timeline.
 */
export function createFakeClock(startAt = 0): FakeClock {
  let now = startAt
  let nextId = 1
  const timers = new Map<number, { at: number; run: () => void }>()

  const clock: RefreshClock = {
    now: () => now,
    setTimeout: (run, delayMs) => {
      const id = nextId++
      timers.set(id, { at: now + delayMs, run })
      return id
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number)
    },
  }

  const advance = (ms: number): void => {
    const target = now + ms
    for (;;) {
      let next: [number, { at: number; run: () => void }] | null = null
      for (const entry of timers) {
        if (entry[1].at > target) continue
        if (next === null || entry[1].at < next[1].at) next = entry
      }
      if (next === null) break
      timers.delete(next[0])
      now = next[1].at
      next[1].run()
    }
    now = target
  }

  const sleep = (ms: number): void => {
    now += ms
  }

  return {
    clock,
    advance,
    sleep,
    pendingTimers: () => timers.size,
  }
}
