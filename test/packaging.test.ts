import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/**
 * Packaging is verified on two levels:
 *
 * 1. the declarations that decide what gets built (checked always), and
 * 2. the real artifact produced by `npm run package`.
 *
 * The YAML is parsed, not regex-scraped, so reflowing the config cannot make a
 * test lie. The artifact checks fail with an actionable message when `release/`
 * is absent rather than quietly skipping the machine-checkable half of the
 * ticket's "double-click and the menu bar item appears" criterion.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_NAME = 'OpenCode Dashboard'
const BUNDLE_ID = 'com.chenzhiyong.opencode-dashboard'
const APP_PATH = join(ROOT, 'release', 'mac', `${APP_NAME}.app`)

type BuilderConfig = {
  appId?: string
  productName?: string
  files?: string[]
  asar?: boolean
  afterPack?: string
  publish?: unknown
  directories?: { output?: string; buildResources?: string }
  extraResources?: unknown
  mac?: {
    target?: Array<{ target?: string; arch?: string[] }>
    category?: string
    icon?: string
    identity?: string | null
    hardenedRuntime?: boolean
    notarize?: boolean
    extendInfo?: { LSUIElement?: boolean; LSMinimumSystemVersion?: string }
  }
}

const builderConfig = parse(
  readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8'),
) as BuilderConfig
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<
  string,
  unknown
>

test('the bundle identity is the agreed one', () => {
  assert.equal(builderConfig.appId, BUNDLE_ID)
  assert.equal(builderConfig.productName, APP_NAME)
  assert.equal(manifest['productName'], APP_NAME)
  assert.equal(manifest['name'], 'opencode-dashboard')
})

test('the packaged app is a menu-bar agent with no Dock slot', () => {
  assert.equal(builderConfig.mac?.extendInfo?.LSUIElement, true)
})

test('the build is unsigned and never notarized', () => {
  assert.equal(builderConfig.mac?.identity, null)
  assert.equal(builderConfig.mac?.hardenedRuntime, false)
  assert.equal(builderConfig.mac?.notarize, false)
})

test('packaging emits an unpacked .app, not an installer image', () => {
  const targets = builderConfig.mac?.target ?? []
  assert.deepEqual(
    targets.map((target) => target.target),
    ['dir'],
  )
  for (const forbidden of ['dmg', 'zip', 'pkg']) {
    assert.ok(
      !targets.some((target) => target.target === forbidden),
      `unexpected ${forbidden} target`,
    )
  }
})

test('only the built output and the manifest ship', () => {
  assert.deepEqual(builderConfig.files, ['out/**', 'package.json'])
  assert.equal(builderConfig.asar, true)
  assert.equal(builderConfig.directories?.output, 'release')
  assert.equal(builderConfig.afterPack, 'scripts/after-pack.cjs')
})

test('there is no auto-update channel', () => {
  assert.equal(builderConfig.publish, undefined)
  assert.equal(manifest['build'], undefined)
  assert.deepEqual(Object.keys((manifest['dependencies'] as Record<string, unknown>) ?? {}), [])
})

test('the app icon is declared and reproducible from the repo', () => {
  assert.equal(builderConfig.mac?.icon, 'build/icon.icns')
  assert.equal(builderConfig.mac?.category, 'public.app-category.utilities')
  assert.ok(existsSync(join(ROOT, 'build', 'icon.icns')))
  assert.ok(existsSync(join(ROOT, 'scripts', 'generate-app-icon.mjs')))
})

// --- artifact checks -------------------------------------------------------

/** Every artifact test goes through here: a missing build is a loud failure. */
function requireApp(): void {
  assert.ok(
    existsSync(APP_PATH),
    `missing ${APP_PATH}: run \`npm run package\` before \`npm test\` (artifact checks are mandatory)`,
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
