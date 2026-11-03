import { formatCountdown } from './panel-view.ts'
import type { UsageState } from './types.ts'
import {
  failureReason,
  fiveHourSummary,
  trayLevel,
  type TrayLevel,
} from './view-model.ts'

/**
 * Everything the floating ball draws.
 *
 * It is the tray's number in a bigger shape: same 5-hour window, same colour
 * tiers, same `—` for every failed state and `…` before the first poll settles.
 * `progress` is the ring fill, and it is 0 whenever the ball shows `—` or `…`
 * so no stale arc can survive a failure.
 */
export type BallView = {
  status: UsageState['status']
  /** `87%` while online, `—`/`…` otherwise. */
  text: string
  level: TrayLevel
  /** Ring fill, 0–100. Zero whenever there is no live number. */
  progress: number
  /** Reset countdown for the 5-hour window; null when there is no number. */
  countdown: string | null
  /** Hover tooltip: spells out what the ring is and why it is muted. */
  tooltip: string
}

export type BallViewInput = {
  state: UsageState
  now: number
}

/** Derives the ball from the newest poll result. Pure. */
export function deriveBallView(input: BallViewInput): BallView {
  const { state, now } = input

  if (state.status === 'loading') {
    return {
      status: state.status,
      text: '…',
      level: 'muted',
      progress: 0,
      countdown: null,
      tooltip: 'OpenCode Go · 正在读取…',
    }
  }

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

  const { remaining, anyLimited } = fiveHourSummary(state.snapshot)
  const countdown = formatCountdown(state.snapshot.rolling.resetsAt - now)

  return {
    status: state.status,
    text: `${remaining}%`,
    level: trayLevel(remaining, anyLimited),
    progress: remaining,
    countdown,
    tooltip: `OpenCode Go · 5 小时窗口剩余 ${remaining}% · ${countdown}`,
  }
}
