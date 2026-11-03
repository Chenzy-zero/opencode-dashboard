import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clamp } from '../src/core/geometry.ts'
import { panelPosition } from '../src/core/panel-position.ts'
import { clampToWorkArea } from '../src/core/ball-position.ts'

test('clamp keeps a value inside an ordinary range', () => {
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(-3, 0, 10), 0)
  assert.equal(clamp(42, 0, 10), 10)
})

test('clamp is what keeps both windows inside a negative-coordinate display', () => {
  // A display left of the primary one: x runs from -1920 to 0.
  const workArea = { x: -1920, y: 0, width: 1920, height: 1080 }
  const size = { width: 96, height: 96 }

  assert.deepEqual(clampToWorkArea({ x: -3000, y: 500 }, size, workArea), { x: -1920, y: 500 })
  assert.equal(panelPosition({ x: -1900, y: 0, width: 24, height: 24 }, { width: 340, height: 300 }, workArea).x, -1912)
})
