/** One usage window as reported by the local service. */
export type UsageWindow = {
  /** 已用百分比, 0–100. */
  percent: number
  limited: boolean
  /** Epoch milliseconds. */
  resetsAt: number
}

/** The three OpenCode Go usage windows, in fixed display order. */
export type UsageSnapshot = {
  rolling: UsageWindow
  weekly: UsageWindow
  monthly: UsageWindow
}

/**
 * Outcome of one poll of the local service.
 *
 * - `online`: newest data, usable.
 * - `offline`: local service unreachable (no service file, connection refused, ...).
 * - `unauthenticated`: service reachable but not signed in to Console.
 * - `error`: reachable but the response was unusable (bad JSON, missing fields, timeout).
 */
export type UsageResult =
  | { status: 'online'; snapshot: UsageSnapshot; fetchedAt: number }
  | { status: 'offline' }
  | { status: 'unauthenticated' }
  | { status: 'error' }

/**
 * What the shell renders, which includes the moment before the first poll has
 * settled. `loading` is deliberately not a `UsageResult`: it is not an outcome
 * of a request, so the adapter can never manufacture it.
 */
export type UsageState = UsageResult | { status: 'loading' }
