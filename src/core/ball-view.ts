import { formatCountdown } from './panel-view.ts'
import type { UsageResult } from './types.ts'
import { failureReason, remainingPercent, trayLevel, type TrayLevel } from './view-model.ts'

/**
 * Everything the floating ball draws.
 *
 * It is the tray's number in a bigger shape: same 5-hour window, same colour
 * tiers, same `—` for every non-online state. `progress` is the ring fill, and
 * it is 0 whenever the ball shows `—` so no stale arc can survive a failure.
 */
export type BallView = {
  status: UsageResult['status']
  /** `87%` while online, `—` otherwise. */
  text: string
  level: TrayLevel
  /** Ring fill, 0–100. Zero whenever `text` is `—`. */
  progress: number
  /** Reset countdown for the 5-hour window; null when there is no number. */
  countdown: string | null
  /** Hover tooltip: spells out what the ring is and why it is muted. */
  tooltip: string
}

export type BallViewInput = {
  state: UsageResult
  now: number
}

/** Derives the ball from the newest poll result. Pure. */
export function deriveBallView(input: BallViewInput): BallView {
  const { state, now } = input

  if (state.status !== 'online') {
    const reason = failureReason(state.status)
    return {
      status: state.status,
      text: '—',
      level: 'muted',
      progress: 0,
      countdown: null,
      tooltip: `OpenCode Go · ${reason}`,
    }
  }

  const { rolling, weekly, monthly } = state.snapshot
  // The ball is the 5-hour window only. The other two windows still matter for
  // the colour: a rate-limited window anywhere means requests are being refused.
  const remaining = remainingPercent(rolling.percent)
  const anyLimited = rolling.limited || weekly.limited || monthly.limited
  const countdown = formatCountdown(rolling.resetsAt - now)

  return {
    status: state.status,
    text: `${remaining}%`,
    level: trayLevel(remaining, anyLimited),
    progress: remaining,
    countdown,
    tooltip: `OpenCode Go · 5 小时窗口剩余 ${remaining}% · ${countdown}`,
  }
}
