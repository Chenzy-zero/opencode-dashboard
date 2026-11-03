import type { BallGeometry } from './ball-position.ts'

/**
 * What the app remembers about the ball between launches: whether it is on
 * screen, and where. Everything else is derived from the newest poll.
 */
export type BallState = BallGeometry & { visible: boolean }

/** First launch: hidden, with the position resolved to the primary corner. */
export const DEFAULT_BALL_STATE: BallState = {
  visible: false,
  displayId: null,
  x: 0,
  y: 0,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coordinate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
}

/**
 * Reads the persisted state defensively. The file lives outside the repo and
 * can be truncated by a crash mid-write, so every field falls back on its own
 * instead of discarding the whole state (or, worse, throwing on launch).
 */
export function parseBallState(raw: string | null): BallState {
  if (raw === null || raw.trim() === '') return { ...DEFAULT_BALL_STATE }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_BALL_STATE }
  }

  if (!isRecord(parsed)) return { ...DEFAULT_BALL_STATE }

  return {
    visible: parsed.visible === true,
    displayId:
      typeof parsed.displayId === 'number' && Number.isFinite(parsed.displayId)
        ? parsed.displayId
        : null,
    x: coordinate(parsed.x),
    y: coordinate(parsed.y),
  }
}

/** Stable, human-readable JSON: the file is small enough to inspect by hand. */
export function serializeBallState(state: BallState): string {
  return `${JSON.stringify(
    { visible: state.visible, displayId: state.displayId, x: state.x, y: state.y },
    null,
    2,
  )}\n`
}
