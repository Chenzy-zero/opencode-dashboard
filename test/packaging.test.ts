import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Packaging is verified on two levels:
 *
 * 1. the declarations that decide what gets built (checked always), and
 * 2. the real artifact, when one has been produced with `npm run package`
 *    (skipped otherwise, so `npm test` never needs a 200 MB Electron build).
 *
 * The second half is the machine-checkable part of the ticket's "double-click
 * and the menu bar item appears" acceptance criterion.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_NAME = 'OpenCode Dashboard'
const BUNDLE_ID = 'com.chenzhiyong.opencode-dashboard'
const APP_PATH = join(ROOT, 'release', 'mac', `${APP_NAME}.app`)

const builderConfig = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>

/** Values in this config are one-per-line, so a line read is a faithful read. */
function topLevel(key: string): string | null {
  return new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(builderConfig)?.[1]?.trim() ?? null
}

function macKey(key: string): string | null {
  return new RegExp(`^[ \\t]+${key}:[ \\t]*(.*)$`, 'm').exec(builderConfig)?.[1]?.trim() ?? null
}

test('the bundle identity is the agreed one', () => {
  assert.equal(topLevel('appId'), BUNDLE_ID)
  assert.equal(topLevel('productName'), APP_NAME)
  assert.equal(manifest['productName'], APP_NAME)
  assert.equal(manifest['name'], 'opencode-dashboard')
})

test('the packaged app is a menu-bar agent with no Dock slot', () => {
  assert.equal(macKey('LSUIElement'), 'true')
})

test('the build is unsigned and never notarized', () => {
  assert.equal(macKey('identity'), 'null')
  assert.equal(macKey('hardenedRuntime'), 'false')
  assert.equal(macKey('notarize'), 'false')
})

test('packaging emits an unpacked .app, not an installer image', () => {
  assert.match(builderConfig, /^[ \t]+- target: dir$/m)
  assert.doesNotMatch(builderConfig, /^[ \t]+- target: (dmg|zip|pkg)$/m)
})

test('only the built output and the manifest ship', () => {
  const files = /^files:\n((?:[ \t]+- .*\n)+)/m.exec(builderConfig)?.[1] ?? ''
  const entries = files
    .split('\n')
    .map((line) => line.replace(/^[ \t]*- /, '').trim())
    .filter(Boolean)

  assert.deepEqual(entries, ['out/**', 'package.json'])
})

test('there is no auto-update channel', () => {
  assert.doesNotMatch(builderConfig, /^\s*publish:/m)
  assert.equal(manifest['build'], undefined)
  assert.deepEqual(Object.keys(manifest['dependencies'] ?? {}), [])
})

test('the app icon is declared and reproducible from the repo', () => {
  assert.equal(macKey('icon'), 'build/icon.icns')
  assert.ok(existsSync(join(ROOT, 'build', 'icon.icns')))
  assert.ok(existsSync(join(ROOT, 'scripts', 'generate-app-icon.mjs')))
})

// --- artifact checks -------------------------------------------------------

const built = existsSync(APP_PATH)
const skip = built ? false : 'no packaged app yet: run npm run package'

function infoPlist(): Record<string, unknown> {
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

test('the built bundle carries the agreed identity', { skip }, () => {
  const plist = infoPlist()

  assert.equal(plist['CFBundleIdentifier'], BUNDLE_ID)
  assert.equal(plist['CFBundleName'], APP_NAME)
  assert.equal(plist['CFBundleDisplayName'], APP_NAME)
  assert.equal(plist['CFBundleExecutable'], APP_NAME)
  assert.equal(plist['LSUIElement'], true)
})

test('the built bundle asks for no extra macOS permissions', { skip }, () => {
  const plist = infoPlist()
  const usageDescriptions = Object.keys(plist).filter((key) => key.endsWith('UsageDescription'))

  assert.deepEqual(usageDescriptions, [])
})

test('the app runs as one process with the menu-bar helper inside', { skip }, () => {
  assert.ok(existsSync(join(APP_PATH, 'Contents', 'MacOS', APP_NAME)))
  assert.ok(existsSync(join(APP_PATH, 'Contents', 'Resources', 'app.asar')))
  assert.ok(existsSync(join(APP_PATH, 'Contents', 'Resources', 'trayTemplate.png')))
})

test('the artifact ships no dev dependencies, sources or tests', { skip }, () => {
  const resources = join(APP_PATH, 'Contents', 'Resources')
  assert.ok(!existsSync(join(resources, 'node_modules')))
  assert.ok(!existsSync(join(resources, 'test')))
  assert.ok(!existsSync(join(resources, 'src')))

  const entries = asarEntries(join(resources, 'app.asar'))
  const allowed = entries.filter((path) => !/^(out\/|package\.json$)/.test(path))
  assert.deepEqual(allowed, [])
})

test('the artifact contains no local service password', { skip }, () => {
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
  assert.ok(!asarEntries(join(APP_PATH, 'Contents', 'Resources', 'app.asar')).includes('service.json'))
})
