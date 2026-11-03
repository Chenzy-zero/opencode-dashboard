import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Artifact checks against the real `release/mac/*.app` produced by
 * `npm run package`. They are split out of `test/packaging.test.ts` (which only
 * verifies the declarations and runs everywhere) so a fresh clone can run
 * `npm test` without building first.
 *
 * Run with `npm run test:artifact` after `npm run package`.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const APP_NAME = 'OpenCode Dashboard'
const BUNDLE_ID = 'com.chenzhiyong.opencode-dashboard'
const APP_PATH = join(ROOT, 'release', 'mac', `${APP_NAME}.app`)

/** Every artifact test goes through here: a missing build is a loud failure. */
function requireApp(): void {
  assert.ok(
    existsSync(APP_PATH),
    `missing ${APP_PATH}: run \`npm run package\` before \`npm run test:artifact\``,
  )
}

function infoPlist(): Record<string, unknown> {
  requireApp()
  const json = execFileSync(
    'plutil',
    ['-convert', 'json', '-o', '-', join(APP_PATH, 'Contents', 'Info.plist')],
    { encoding: 'utf8' },
  )
  return JSON.parse(json) as Record<string, unknown>
}

function asarEntries(asarPath: string): string[] {
  const buffer = readFileSync(asarPath)
  // asar header: 4 bytes magic, 4 size, then a pickle whose payload is
  // [uint32 jsonLength][json]. See @electron/asar readArchiveHeader.
  const jsonLength = buffer.readUInt32LE(12)
  const header = JSON.parse(buffer.toString('utf8', 16, 16 + jsonLength)) as {
    files: Record<string, { files?: unknown }>
  }
  const paths: string[] = []
  const walk = (node: { files?: Record<string, { files?: unknown }> }, prefix: string): void => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const path = `${prefix}${name}`
      if (child.files) walk(child as { files: Record<string, { files?: unknown }> }, `${path}/`)
      else paths.push(path)
    }
  }
  walk(header, '')
  return paths
}

test('the built bundle carries the agreed identity', () => {
  const plist = infoPlist()

  assert.equal(plist['CFBundleIdentifier'], BUNDLE_ID)
  assert.equal(plist['CFBundleName'], APP_NAME)
  assert.equal(plist['CFBundleDisplayName'], APP_NAME)
  assert.equal(plist['CFBundleExecutable'], APP_NAME)
  assert.equal(plist['LSUIElement'], true)
})

test('the built bundle is ad-hoc signed so child processes can start', () => {
  requireApp()
  // `codesign -dv` prints its report on stderr. An unsigned bundle reports
  // "code object is not signed at all"; ad-hoc reports "Signature=adhoc".
  const result = spawnSync('codesign', ['-dv', APP_PATH], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(`${result.stdout}${result.stderr}`, /Signature=adhoc/)
})

test('the built bundle asks for no extra macOS permissions', () => {
  const plist = infoPlist()
  const usageDescriptions = Object.keys(plist).filter((key) => key.endsWith('UsageDescription'))

  assert.deepEqual(usageDescriptions, [])
})

test('the app runs as one process with the menu-bar helper inside', () => {
  requireApp()
  assert.ok(existsSync(join(APP_PATH, 'Contents', 'MacOS', APP_NAME)))
  assert.ok(existsSync(join(APP_PATH, 'Contents', 'Resources', 'app.asar')))
  assert.ok(existsSync(join(APP_PATH, 'Contents', 'Resources', 'trayTemplate.png')))
})

test('the artifact ships no dev dependencies, sources or tests', () => {
  requireApp()
  const resources = join(APP_PATH, 'Contents', 'Resources')
  assert.ok(!existsSync(join(resources, 'node_modules')))
  assert.ok(!existsSync(join(resources, 'test')))
  assert.ok(!existsSync(join(resources, 'src')))

  const entries = asarEntries(join(resources, 'app.asar'))
  const allowed = entries.filter((path) => !/^(out\/|package\.json$)/.test(path))
  assert.deepEqual(allowed, [])
})

test('the artifact contains no local service password', () => {
  requireApp()
  const serviceFile = join(
    process.env['HOME'] ?? '',
    '.local',
    'state',
    'opencode',
    'service.json',
  )
  if (!existsSync(serviceFile)) {
    // Nothing to leak on this machine; the file-list check still applies.
    return
  }
  const password = (JSON.parse(readFileSync(serviceFile, 'utf8')) as { password?: string }).password
  assert.ok(password, 'service.json without a password is not the file we expect')

  const asar = readFileSync(join(APP_PATH, 'Contents', 'Resources', 'app.asar'))
  const hit = asar.includes(Buffer.from(password as string, 'utf8'))
  assert.equal(hit, false, 'the local service password must never be bundled')
  assert.ok(
    !asarEntries(join(APP_PATH, 'Contents', 'Resources', 'app.asar')).includes('service.json'),
  )
})
