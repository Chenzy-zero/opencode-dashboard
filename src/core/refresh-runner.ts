import type { RefreshReason } from './refresh-scheduler.ts'
import type { UsageResult } from './types.ts'

/**
 * Serialises polls and makes sure a manual trigger is never lost.
 *
 * The scheduler may fire while a fetch is still in flight (a 60 s tick, a
 * 立即刷新 click, a wake). Rather than silently dropping the later request, one
 * follow-up is queued and run as soon as the current fetch settles. While any
 * fetch is running `isRefreshing` is true so the panel can show an indicator
 * without touching the numbers it already has.
 */
export type RefreshRunnerOptions = {
  refresh: (reason: RefreshReason) => Promise<UsageResult>
  onResult: (result: UsageResult, reason: RefreshReason) => void
  /** Called when the in-flight flag changes, so the shell can repaint. */
  onChange?: (refreshing: boolean) => void
  /**
   * `refresh` should classify expected failures itself; this catches a bug so
   * one unexpected throw cannot wedge the queue forever.
   */
  onError?: (error: unknown, reason: RefreshReason) => void
}

export type RefreshRunner = {
  run: (reason: RefreshReason) => void
  isRefreshing: () => boolean
}

export function createRefreshRunner(options: RefreshRunnerOptions): RefreshRunner {
  let polling = false
  let queued: RefreshReason | null = null

  const loop = async (first: RefreshReason): Promise<void> => {
    let reason: RefreshReason | null = first
    try {
      while (reason !== null) {
        let result: UsageResult
        try {
          result = await options.refresh(reason)
        } catch (error) {
          options.onError?.(error, reason)
          result = { status: 'error' }
        }
        options.onResult(result, reason)
        reason = queued
        queued = null
      }
    } finally {
      polling = false
      options.onChange?.(false)
    }
  }

  return {
    run(reason) {
      if (polling) {
        // At most one follow-up: a burst of clicks during one slow fetch must
        // not turn into a burst of requests afterwards.
        queued = reason
        options.onChange?.(true)
        return
      }

      polling = true
      options.onChange?.(true)
      void loop(reason)
    },

    isRefreshing: () => polling,
  }
}
