import type { UsageResult, UsageSnapshot } from './types.ts'
import { failureReason, remainingPercent } from './view-model.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type WindowKey = keyof UsageSnapshot

/**
 * Fixed display order. The spec is explicit that it must not depend on the
 * values, so this is a literal list rather than a sort.
 */
const WINDOWS: ReadonlyArray<{ key: WindowKey; name: string }> = [
  { key: 'rolling', name: '5 小时窗口' },
  { key: 'weekly', name: '周窗口' },
  { key: 'monthly', name: '月窗口' },
]

/**
 * Human countdown to a reset, e.g. `2 小时 13 分后`.
 *
 * The spec deliberately drops precision as the distance grows: minutes are
 * noise once the wait is measured in days, and seconds are never shown.
 * A reset in the past is treated as imminent rather than as a negative number.
 */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '即将重置'
  if (remainingMs < MINUTE) return '不到 1 分后'

  if (remainingMs < HOUR) {
    return `${Math.floor(remainingMs / MINUTE)} 分后`
  }

  if (remainingMs < DAY) {
    const hours = Math.floor(remainingMs / HOUR)
    const minutes = Math.floor((remainingMs % HOUR) / MINUTE)
    return minutes === 0 ? `${hours} 小时后` : `${hours} 小时 ${minutes} 分后`
  }

  const days = Math.floor(remainingMs / DAY)
  const hours = Math.floor((remainingMs % DAY) / HOUR)
  return hours === 0 ? `${days} 天后` : `${days} 天 ${hours} 小时后`
}

/** `19:17` in the machine's local time zone. */
function formatClock(epochMs: number): string {
  const at = new Date(epochMs)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** `2 小时 13 分后 · 19:17` — countdown and absolute time stay together. */
export function formatResetText(resetsAt: number, now: number): string {
  return `${formatCountdown(resetsAt - now)} · ${formatClock(resetsAt)}`
}

export type PanelRow = {
  key: WindowKey
  /** `5 小时窗口`, `周窗口`, `月窗口`. */
  name: string
  /** 剩余额度, rounded to a whole percent. */
  remaining: number
  remainingText: string
  /** Same 0–100 value, ready for the bar width. */
  progress: number
  limited: boolean
  /** `已限流` when limited, otherwise null. */
  limitedText: string | null
  resetCountdown: string
  resetAbsolute: string
  /** Countdown and absolute time combined, e.g. `2 小时 13 分后 · 19:17`. */
  resetText: string
}

/**
 * Everything the renderer draws, already formatted.
 *
 * `rows` is null whenever no current numbers exist: showing an old percentage
 * next to `OpenCode 未运行` is exactly the mistake the spec forbids.
 */
export type PanelView = {
  status: UsageResult['status']
  rows: PanelRow[] | null
  /** Non-online reason (`OpenCode 未运行`, ...), null while online. */
  statusText: string | null
  /**
   * What the user can do about a failure. Distinct from `statusText`: the
   * reason names the problem, the hint names the next step.
   */
  statusHint: string | null
  /**
   * 「重试」 while the panel has something to retry, null when it does not.
   * Availability and button copy are one field so they cannot disagree.
   */
  retryLabel: string | null
  updatedAtText: string
  fetchedAt: number | null
}

/**
 * Actionable advice per failure. 「未登录」 is not 「离线」: one means "start
 * OpenCode", the other means "sign in inside OpenCode", so the wording must not
 * collapse them.
 */
function failureHint(status: 'offline' | 'unauthenticated' | 'error'): string {
  switch (status) {
    case 'offline':
      return '打开 OpenCode 桌面端后重试'
    case 'unauthenticated':
      return '在 OpenCode 里用 /connect 登录 Console 后重试'
    case 'error':
      return 'OpenCode 响应异常，稍后重试'
  }
}

export type PanelViewInput = {
  state: UsageResult
  now: number
  /** Last successful fetch, retained while the app is offline/erroring. */
  lastFetchedAt: number | null
}

function formatUpdatedAt(fetchedAt: number | null, now: number): string {
  if (fetchedAt === null) return '尚未更新'

  const age = Math.max(0, now - fetchedAt)
  if (age < MINUTE) return '最后更新 刚刚'

  const minutes = Math.floor(age / MINUTE)
  if (minutes < 60) return `最后更新 ${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `最后更新 ${hours} 小时前`

  return `最后更新 ${Math.floor(hours / 24)} 天前`
}

/** Derives the whole panel from the newest poll result. Pure. */
export function derivePanelView(input: PanelViewInput): PanelView {
  const { state, now } = input

  if (state.status !== 'online') {
    return {
      status: state.status,
      rows: null,
      statusText: failureReason(state.status),
      statusHint: failureHint(state.status),
      retryLabel: '重试',
      updatedAtText: formatUpdatedAt(input.lastFetchedAt, now),
      fetchedAt: input.lastFetchedAt,
    }
  }

  const rows = WINDOWS.map(({ key, name }): PanelRow => {
    const window = state.snapshot[key]
    const remaining = remainingPercent(window.percent)
    const resetCountdown = formatCountdown(window.resetsAt - now)
    return {
      key,
      name,
      remaining,
      remainingText: `${remaining}%`,
      progress: remaining,
      limited: window.limited,
      limitedText: window.limited ? '已限流' : null,
      resetCountdown,
      resetAbsolute: formatClock(window.resetsAt),
      resetText: formatResetText(window.resetsAt, now),
    }
  })

  return {
    status: state.status,
    rows,
    statusText: null,
    statusHint: null,
    retryLabel: null,
    updatedAtText: formatUpdatedAt(state.fetchedAt, now),
    fetchedAt: state.fetchedAt,
  }
}
