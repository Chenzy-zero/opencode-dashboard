import { readServiceCredentials } from './service.ts'
import type { UsageResult, UsageSnapshot } from './types.ts'

const LIMITS_PATH = '/api/experimental/usage/limits'
const AUTH_USER = 'opencode'
const DEFAULT_TIMEOUT_MS = 5_000

export type ReadUsageOptions = {
  /** Path to the service.json; defaults to ~/.local/state/opencode/service.json. */
  serviceFile?: string
  timeoutMs?: number
  now?: () => number
}

type LimitsPayload = {
  data?: { go?: unknown } | null
}

function isWindow(value: unknown): value is UsageSnapshot['rolling'] {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.percent === 'number' &&
    Number.isFinite(record.percent) &&
    typeof record.limited === 'boolean' &&
    typeof record.resetsAt === 'number' &&
    Number.isFinite(record.resetsAt)
  )
}

function toSnapshot(value: unknown): UsageSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!isWindow(record.rolling) || !isWindow(record.weekly) || !isWindow(record.monthly)) {
    return null
  }
  return { rolling: record.rolling, weekly: record.weekly, monthly: record.monthly }
}

function authHeader(password: string): string {
  return `Basic ${Buffer.from(`${AUTH_USER}:${password}`, 'utf8').toString('base64')}`
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

/**
 * Polls the local service once and classifies the outcome. Never throws for
 * network or payload problems: the caller (tray shell) only needs the state.
 */
export async function readUsage(options: ReadUsageOptions = {}): Promise<UsageResult> {
  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const service = await readServiceCredentials(options.serviceFile)
  if (!service) return { status: 'offline' }

  const url = `${service.url.replace(/\/+$/, '')}${LIMITS_PATH}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader(service.password),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    // A timed-out request is "abnormal data"; anything else means the local
    // service is not reachable (not started, restarted on a new port, ...).
    return isAbort(error) ? { status: 'error' } : { status: 'offline' }
  }

  if (response.status === 401) return { status: 'unauthenticated' }
  if (!response.ok) return { status: 'error' }

  let payload: LimitsPayload
  try {
    payload = (await response.json()) as LimitsPayload
  } catch {
    return { status: 'error' }
  }
  if (payload.data === null) return { status: 'unauthenticated' }

  const snapshot = toSnapshot(payload.data?.go)
  if (!snapshot) return { status: 'error' }

  return { status: 'online', snapshot, fetchedAt: now() }
}
