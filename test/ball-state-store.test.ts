import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createBallStateStore } from '../src/main/preferences.ts'
import { DEFAULT_BALL_STATE } from '../src/core/ball-state.ts'

const directory = mkdtempSync(join(tmpdir(), 'opencode-dashboard-prefs-'))
after(() => rmSync(directory, { recursive: true, force: true }))

let counter = 0
function storePath(): string {
  counter += 1
  return join(directory, `state-${counter}.json`)
}

test('a saved state is there again after a restart', () => {
  const path = storePath()
  createBallStateStore(path).save({ visible: true, displayId: 3, x: 900, y: 40 })

  // A new store instance stands in for the next launch of the app.
  assert.deepEqual(createBallStateStore(path).load(), {
    visible: true,
    displayId: 3,
    x: 900,
    y: 40,
  })
})

test('a missing file loads the default state instead of throwing', () => {
  assert.deepEqual(createBallStateStore(join(directory, 'never-written.json')).load(), DEFAULT_BALL_STATE)
})

test('a corrupt file loads the default state and is replaced by the next save', () => {
  const path = storePath()
  writeFileSync(path, '{"visible": tr')
  const store = createBallStateStore(path)

  assert.deepEqual(store.load(), DEFAULT_BALL_STATE)

  store.save({ visible: true, displayId: 1, x: 5, y: 6 })
  assert.deepEqual(createBallStateStore(path).load(), { visible: true, displayId: 1, x: 5, y: 6 })
})

test('the state file is created in a directory that does not exist yet', () => {
  const path = join(directory, 'nested', 'deeper', 'state.json')
  createBallStateStore(path).save({ visible: false, displayId: null, x: 0, y: 0 })

  assert.deepEqual(createBallStateStore(path).load(), DEFAULT_BALL_STATE)
})

test('the file on disk is plain JSON with no credentials or unrelated data', () => {
  const path = storePath()
  createBallStateStore(path).save({ visible: true, displayId: 1, x: 10, y: 20 })

  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  assert.deepEqual(Object.keys(raw).sort(), ['displayId', 'visible', 'x', 'y'])
})
