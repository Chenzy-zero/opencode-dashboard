const MINUTE = 60_000

/**
 * Age of the last successful fetch, e.g. `最后更新 2 分钟前`.
 *
 * Shared by the panel footer and the tray tooltip: both need to say how old the
 * numbers are without ever re-displaying them.
 */
export function formatUpdatedAt(fetchedAt: number | null, now: number): string {
  if (fetchedAt === null) return '尚未更新'

  const age = Math.max(0, now - fetchedAt)
  if (age < MINUTE) return '最后更新 刚刚'

  const minutes = Math.floor(age / MINUTE)
  if (minutes < 60) return `最后更新 ${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `最后更新 ${hours} 小时前`

  return `最后更新 ${Math.floor(hours / 24)} 天前`
}
