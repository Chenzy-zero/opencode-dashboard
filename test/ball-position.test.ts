import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  clampToWorkArea,
  defaultBallPosition,
  resolveBallPosition,
  snapToNearestEdge,
} from '../src/core/ball-position.ts'

const BALL = { width: 96, height: 96 }
/** Primary display: menu bar on top (y = 25), Dock at the bottom. */
const WORK_AREA = { x: 0, y: 25, width: 1440, height: 875 }

test('a ball dropped near the middle snaps to the closest work-area edge', () => {
  // Centre (348, 148): 123 px from the top edge, 348 px from the left.
  const position = snapToNearestEdge({ x: 300, y: 100, ...BALL }, WORK_AREA)

  assert.deepEqual(position, { x: 300, y: 25 })
})

test('a ball dropped near a side snaps flush to that side', () => {
  assert.deepEqual(snapToNearestEdge({ x: 1200, y: 500, ...BALL }, WORK_AREA), { x: 1440 - 96, y: 500 })
  assert.deepEqual(snapToNearestEdge({ x: 4, y: 500, ...BALL }, WORK_AREA), { x: 0, y: 500 })
})

test('snapping keeps the ball inside the work area on the perpendicular axis', () => {
  // Bottom edge wins, but x is off-screen to the right.
  const position = snapToNearestEdge({ x: 2000, y: 880, ...BALL }, WORK_AREA)

  assert.equal(position.y, 25 + 875 - 96)
  assert.equal(position.x, 1440 - 96)
})

test('a display to the left of the primary one has negative coordinates', () => {
  const workArea = { x: -1920, y: 0, width: 1920, height: 1080 }
  // Centre is (-200 + 48, 500 + 48) = (-152, 548); the right edge is closest.
  const position = snapToNearestEdge({ x: -200, y: 500, ...BALL }, workArea)

  assert.deepEqual(position, { x: -96, y: 500 })
})

test('clamping never moves a ball that is already inside the work area', () => {
  assert.deepEqual(clampToWorkArea({ x: 200, y: 300 }, BALL, WORK_AREA), { x: 200, y: 300 })
})

test('clamping pulls a ball back inside a display that just shrank', () => {
  const smaller = { x: 0, y: 25, width: 900, height: 600 }
  assert.deepEqual(clampToWorkArea({ x: 1300, y: 800 }, BALL, smaller), { x: 804, y: 529 })
})

test('the default position is the bottom-right corner of the work area', () => {
  assert.deepEqual(defaultBallPosition(BALL, WORK_AREA), {
    x: WORK_AREA.x + WORK_AREA.width - BALL.width - 16,
    y: WORK_AREA.y + WORK_AREA.height - BALL.height - 16,
  })
})

const DISPLAYS = [
  { id: 1, workArea: WORK_AREA },
  { id: 2, workArea: { x: -1920, y: 0, width: 1920, height: 1080 } },
]

test('a saved position is restored on the display it was saved on', () => {
  const resolved = resolveBallPosition(
    { displayId: 2, x: -500, y: 400 },
    BALL,
    DISPLAYS,
    1,
  )

  assert.deepEqual(resolved, { displayId: 2, x: -500, y: 400 })
})

test('a saved position on a display that is no longer attached falls back to the primary corner', () => {
  const resolved = resolveBallPosition({ displayId: 9, x: -500, y: 400 }, BALL, DISPLAYS, 1)

  assert.deepEqual(resolved, { displayId: 1, ...defaultBallPosition(BALL, WORK_AREA) })
})

test('a never-saved ball starts at the primary display corner, hidden', () => {
  const resolved = resolveBallPosition({ displayId: null, x: 0, y: 0 }, BALL, DISPLAYS, 1)

  assert.deepEqual(resolved, { displayId: 1, ...defaultBallPosition(BALL, WORK_AREA) })
})

test('a saved position that no longer fits its display is clamped, not discarded', () => {
  const shrunk = [{ id: 1, workArea: { x: 0, y: 25, width: 900, height: 600 } }]
  const resolved = resolveBallPosition({ displayId: 1, x: 1300, y: 800 }, BALL, shrunk, 1)

  assert.deepEqual(resolved, { displayId: 1, x: 804, y: 529 })
})
