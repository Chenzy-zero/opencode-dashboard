import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Connection details for the local OpenCode service. */
export type ServiceCredentials = {
  url: string
  password: string
}

/** The desktop app rewrites this file on every start (random port). Never hardcode the port. */
export function defaultServiceFile(): string {
  return join(homedir(), '.local', 'state', 'opencode', 'service.json')
}

function isCredentials(value: unknown): value is ServiceCredentials {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.url === 'string' && typeof record.password === 'string'
}

/**
 * Reads url/password fresh. Returns null when the file is missing, unreadable or
 * malformed — all of which mean "the local service is not running".
 *
 * The contents are never logged; this object only exists in memory.
 */
export async function readServiceCredentials(
  serviceFile: string = defaultServiceFile(),
): Promise<ServiceCredentials | null> {
  let raw: string
  try {
    raw = await readFile(serviceFile, 'utf8')
  } catch {
    // ENOENT / EACCES / EPERM all mean "no usable local service".
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isCredentials(parsed)) return null
    return { url: parsed.url, password: parsed.password }
  } catch {
    // Partial write or corrupt file.
    return null
  }
}
