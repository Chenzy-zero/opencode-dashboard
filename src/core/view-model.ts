import type { UsageSnapshot, UsageState } from './types.ts'
import { formatUpdatedAt } from './updated-at.ts'

/**
 * Converts the service's "used" percentage into the remaining allowance this
 * app displays, rounded to a whole percent. Never trusts the input to be in
 * range: the service is local but its payload is still external data.
 */
export function remainingPercent(usedPercent: number): number {
  const clamped = Math.min(100, Math.max(0, usedPercent))
  return Math.round(100 - clamped)
}

/** Colour tiers for the menu-bar item. The shell maps these to actual colours. */
export type TrayLevel = 'ok' | 'warn' | 'crit' | 'muted'
export type TrayView = {
  /** Text next to the template icon, e.g. `87%`, `—` or `…` while loading. */
  text: string
  level: TrayLevel
  tooltip: string
}

/** 剩余额度 thresholds, fixed for v1 (see spec: no settings panel). */
const WARN_AT = 20
const CRIT_AT = 10

/**
 * Tiers are applied to the rounded value the user actually sees, so the colour
 * and the number can never disagree. A rate-limited window always wins.
 */
export function trayLevel(remaining: number, anyLimited: boolean): TrayLevel {
  if (anyLimited) return 'crit'
  if (remaining < CRIT_AT) return 'crit'
  if (remaining <= WARN_AT) return 'warn'
  return 'ok'
}

/** The 5-hour window is the tray's and the ball's headline number. */
export type FiveHourSummary = {
  /** 剩余额度, already rounded and clamped. */
  remaining: number
  /** True when any window is rate-limited, not only the 5-hour one. */
  anyLimited: boolean
}

/**
 * The tray and the ball both headline the 5-hour window and both turn red when
 * any window is rate-limited. One function so the two can never drift apart.
 */
export function fiveHourSummary(snapshot: UsageSnapshot): FiveHourSummary {
  return {
    remaining: remainingPercent(snapshot.rolling.percent),
    anyLimited:
      snapshot.rolling.limited || snapshot.weekly.limited || snapshot.monthly.limited,
  }
}

export type TrayViewInput = {
  state: UsageState
  now: number
  /** Kept across failures so the tooltip can still say how old the data is. */
  lastFetchedAt: number | null
}

function withUpdatedAt(text: string, fetchedAt: number | null, now: number): string {
  return fetchedAt === null ? text : `${text} · ${formatUpdatedAt(fetchedAt, now)}`
}

/** Derives everything the tray needs from the newest poll result. Pure. */
export function deriveTrayView(input: TrayViewInput): TrayView {
  const { state, now } = input

  if (state.status === 'loading') {
    return {
      text: '…',
      level: 'muted',
      tooltip: withUpdatedAt('正在读取…', input.lastFetchedAt, now),
    }
  }

  if (state.status !== 'online') {
    return {
      text: '—',
      level: 'muted',
      tooltip: withUpdatedAt(failureReason(state.status), input.lastFetchedAt, now),
    }
  }

  const { remaining, anyLimited } = fiveHourSummary(state.snapshot)
  const { weekly, monthly } = state.snapshot

  return {
    text: `${remaining}%`,
    level: trayLevel(remaining, anyLimited),
    tooltip: [
      `5 小时窗口 ${remaining}%`,
      `周窗口 ${remainingPercent(weekly.percent)}%`,
      `月窗口 ${remainingPercent(monthly.percent)}%`,
      formatUpdatedAt(state.fetchedAt, now),
    ].join(' · '),
  }
}

/** User-facing explanation for each non-online state. Shared with the panel. */
export function failureReason(status: 'offline' | 'unauthenticated' | 'error'): string {
  switch (status) {
    case 'offline':
      return 'OpenCode 未运行'
    case 'unauthenticated':
      return '未登录 Console'
    case 'error':
      return '数据异常'
  }
}
