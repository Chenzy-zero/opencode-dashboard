import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type TempService = {
  /** Path to a service.json holding the given url and password. */
  serviceFile: string
  password: string
}

/** Writes a service.json into a fresh temp directory, like the real desktop app does. */
export async function writeTempService(
  url: string,
  password = 'test-password-2f8a',
): Promise<TempService> {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-dashboard-'))
  const serviceFile = join(dir, 'service.json')
  await writeFile(
    serviceFile,
    JSON.stringify({ id: 'stub', version: '2.2.0', url, pid: 1234, password }),
    { mode: 0o600 },
  )
  return { serviceFile, password }
}
