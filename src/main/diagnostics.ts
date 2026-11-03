import { app } from 'electron'
import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * A tiny append-only log for the things that only go wrong on a real desktop:
 * window creation, renderer deaths, and child-process crashes. It exists so a
 * user-visible "it vanished" can be explained from a file afterwards, because a
 * native crash leaves no stack in the terminal when the app was launched from
 * Launchpad.
 *
 * Deliberately small: lifecycle events only, no polling, no payloads, and never
 * the local service password.
 */
const MAX_BYTES = 256 * 1024

let logPath: string | null = null

export function initDiagnostics(): void {
  try {
    logPath = join(app.getPath('userData'), 'diagnostics.log')
    mkdirSync(dirname(logPath), { recursive: true })
    // One rotation per launch keeps the file bounded without a background job.
    if ((statSync(logPath, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
      truncateSync(logPath, 0)
    }
  } catch {
    logPath = null
  }
}

export function diag(event: string, detail?: unknown): void {
  if (!logPath) return
  const suffix = detail === undefined ? '' : ` ${safeJson(detail)}`
  try {
    appendFileSync(logPath, `${new Date().toISOString()} ${event}${suffix}\n`)
  } catch {
    // Diagnostics must never take the app down.
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
