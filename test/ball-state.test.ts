import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_BALL_STATE,
  parseBallState,
  serializeBallState,
} from '../src/core/ball-state.ts'

test('a serialized state reads back identically', () => {
  const state = { visible: true, displayId: 2, x: -540, y: 300 }

  assert.deepEqual(parseBallState(serializeBallState(state)), state)
})

test('a fresh install starts with the ball hidden and no saved position', () => {
  assert.deepEqual(DEFAULT_BALL_STATE, { visible: false, displayId: null, x: 0, y: 0 })
  assert.deepEqual(parseBallState(null), DEFAULT_BALL_STATE)
  assert.deepEqual(parseBallState(''), DEFAULT_BALL_STATE)
  assert.deepEqual(parseBallState('not json'), DEFAULT_BALL_STATE)
})

test('a corrupt file never crashes the app or fakes an enabled ball', () => {
  assert.deepEqual(parseBallState('{"visible":'), DEFAULT_BALL_STATE)
  assert.deepEqual(parseBallState('[]'), DEFAULT_BALL_STATE)
  assert.deepEqual(parseBallState('null'), DEFAULT_BALL_STATE)
})

test('valid fields survive even when one field is of the wrong type', () => {
  const state = parseBallState('{"visible":true,"displayId":"two","x":120.4,"y":-40}')

  assert.deepEqual(state, { visible: true, displayId: null, x: 120, y: -40 })
})

test('unknown fields from a future version are ignored', () => {
  const state = parseBallState('{"visible":true,"displayId":1,"x":10,"y":20,"theme":"dark"}')

  assert.deepEqual(state, { visible: true, displayId: 1, x: 10, y: 20 })
})

test('non-finite coordinates fall back instead of poisoning the position math', () => {
  assert.deepEqual(parseBallState('{"visible":true,"displayId":1,"x":null,"y":"20"}'), {
    visible: true,
    displayId: 1,
    x: 0,
    y: 0,
  })
})
