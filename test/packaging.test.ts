import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/**
 * Declarations that decide what gets built. These run on a fresh clone with no
 * `release/` present; the checks against the real artifact live in
 * `test/artifact/` and run via `npm run test:artifact` after `npm run package`.
 *
 * The YAML is parsed, not regex-scraped, so reflowing the config cannot make a
 * test lie.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_NAME = 'OpenCode Dashboard'
const BUNDLE_ID = 'com.chenzhiyong.opencode-dashboard'

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

test('the build uses an ad-hoc signature and is never notarized', () => {
  assert.equal(builderConfig.mac?.identity, '-')
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
