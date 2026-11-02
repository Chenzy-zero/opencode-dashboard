/** Why a refresh was requested. Drives logging and, later, UI hints. */
export type RefreshReason = 'startup' | 'interval' | 'manual' | 'wake'

/**
 * The only ambient dependency of the scheduler: a clock. Injecting it keeps the
 * cadence tests deterministic instead of waiting real minutes.
 */
export type RefreshClock = {
  now: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export const systemClock: RefreshClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** v1 constant from the spec: no settings for the refresh interval. */
export const DEFAULT_INTERVAL_MS = 60_000

export type RefreshSchedulerOptions = {
  clock?: RefreshClock
  intervalMs?: number
  /** Called once per refresh. May start async work; the scheduler never awaits. */
  onTick: (reason: RefreshReason, at: number) => void
}

export function createRefreshScheduler(options: RefreshSchedulerOptions) {
  const clock = options.clock ?? systemClock
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const { onTick } = options

  let running = false
  let timer: unknown = null

  const cancel = (): void => {
    if (timer === null) return
    clock.clearTimeout(timer)
    timer = null
  }

  const scheduleNext = (): void => {
    cancel()
    timer = clock.setTimeout(() => {
      timer = null
      onTick('interval', clock.now())
      if (running) scheduleNext()
    }, intervalMs)
  }

  return {
    /** Fires immediately, then keeps firing on the configured interval. */
    start(): void {
      if (running) return
      running = true
      onTick('startup', clock.now())
      scheduleNext()
    },

    /** Refreshes now, e.g. from the tray menu's 「立即刷新」. */
    trigger(): void {
      if (!running) return
      onTick('manual', clock.now())
    },

    /**
     * macOS resume: refresh now and restart the interval. Sleep pauses timers,
     * so the pre-sleep timer would otherwise be overdue and fire a second time
     * right after the wake refresh.
     */
    notifyWake(): void {
      if (!running) return
      scheduleNext()
      onTick('wake', clock.now())
    },

    /** Called on quit: no timer may outlive the app's windows. */
    stop(): void {
      running = false
      cancel()
    },
  }
}
