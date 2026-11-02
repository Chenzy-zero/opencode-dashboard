import assert from 'node:assert/strict'
import { test } from 'node:test'

import { panelPosition } from '../src/core/panel-position.ts'

const PANEL = { width: 340, height: 300 }
const WORK_AREA = { x: 0, y: 25, width: 1440, height: 875 }

test('panel is centred under the tray icon', () => {
  const position = panelPosition({ x: 1000, y: 0, width: 24, height: 24 }, PANEL, WORK_AREA)

  assert.deepEqual(position, { x: 842, y: 28 })
})

test('panel is clamped inside the right edge of the display', () => {
  const position = panelPosition({ x: 1420, y: 0, width: 24, height: 24 }, PANEL, WORK_AREA)

  assert.equal(position.x, WORK_AREA.x + WORK_AREA.width - PANEL.width - 8)
})

test('panel flips above the tray when there is no room below', () => {
  const position = panelPosition({ x: 700, y: 880, width: 24, height: 24 }, PANEL, WORK_AREA)

  assert.equal(position.y, 576)
})

test('panel stays inside a display left of the primary one', () => {
  const workArea = { x: -1920, y: 0, width: 1920, height: 1080 }
  const position = panelPosition({ x: -1920, y: 0, width: 24, height: 24 }, PANEL, workArea)

  assert.equal(position.x, workArea.x + 8)
})
