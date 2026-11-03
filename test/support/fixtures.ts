import type { UsageResult, UsageSnapshot } from '../../src/core/types.ts'

/** The clock most view tests share, so countdowns and ages are deterministic. */
export const NOW = new Date(2026, 10, 2, 17, 4).getTime()
export const MINUTE = 60_000
export const LAST_SUCCESS = NOW - 5 * MINUTE
export const FETCHED_AT = 1_700_000_000_000
export const SNAPSHOT_RESETS_AT = 1_793_618_267_000

export type WindowName = keyof UsageSnapshot

/** Used percentages per window, in the API's own direction. */
export type UsedPercents = Record<WindowName, number>

export type SnapshotOptions = {
  limited?: WindowName[]
  resetsAt?: number
}

export function makeSnapshot(used: UsedPercents, options: SnapshotOptions = {}): UsageSnapshot {
  const { limited = [], resetsAt = SNAPSHOT_RESETS_AT } = options
  const window = (name: WindowName) => ({
    percent: used[name],
    limited: limited.includes(name),
    resetsAt,
  })
  return { rolling: window('rolling'), weekly: window('weekly'), monthly: window('monthly') }
}

export type OnlineOptions = SnapshotOptions & { fetchedAt?: number }

/** A successful poll, the only state that carries numbers. */
export function onlineResult(
  used: UsedPercents,
  options: OnlineOptions = {},
): UsageResult {
  const { fetchedAt = FETCHED_AT, ...snapshotOptions } = options
  return {
    status: 'online',
    snapshot: makeSnapshot(used, snapshotOptions),
    fetchedAt,
  }
}
