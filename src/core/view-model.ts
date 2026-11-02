import type { UsageResult } from './types.ts'

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
  /** Text next to the template icon, e.g. `87%` or `—`. */
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

/** Derives everything the tray needs from the newest poll result. Pure. */
export function deriveTrayView(state: UsageResult): TrayView {
  if (state.status !== 'online') {
    return { text: '—', level: 'muted', tooltip: failureReason(state.status) }
  }

  const { rolling, weekly, monthly } = state.snapshot
  const remaining = remainingPercent(rolling.percent)
  const anyLimited = rolling.limited || weekly.limited || monthly.limited

  return {
    text: `${remaining}%`,
    level: trayLevel(remaining, anyLimited),
    tooltip: [
      `5 小时窗口 ${remaining}%`,
      `周窗口 ${remainingPercent(weekly.percent)}%`,
      `月窗口 ${remainingPercent(monthly.percent)}%`,
    ].join(' · '),
  }
}

function failureReason(status: 'offline' | 'unauthenticated' | 'error'): string {
  switch (status) {
    case 'offline':
      return 'OpenCode 未运行'
    case 'unauthenticated':
      return '未登录 Console'
    case 'error':
      return '数据异常'
  }
}

