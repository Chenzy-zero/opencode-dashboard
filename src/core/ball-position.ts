import { clamp, type Point, type Rect, type Size } from './geometry.ts'

/** Gap between the ball and the work-area corner when it has never been placed. */
export const DEFAULT_BALL_MARGIN = 16

/**
 * Keeps a ball fully inside one display's work area. Coordinates are DIP and
 * may be negative (a display left of or above the primary one), so this never
 * clamps to 0.
 */
export function clampToWorkArea(position: Point, size: Size, workArea: Rect): Point {
  return {
    x: clamp(position.x, workArea.x, workArea.x + workArea.width - size.width),
    y: clamp(position.y, workArea.y, workArea.y + workArea.height - size.height),
  }
}

/** Bottom-right corner: the least intrusive place for a HUD on first launch. */
export function defaultBallPosition(
  size: Size,
  workArea: Rect,
  margin = DEFAULT_BALL_MARGIN,
): Point {
  return clampToWorkArea(
    {
      x: workArea.x + workArea.width - size.width - margin,
      y: workArea.y + workArea.height - size.height - margin,
    },
    size,
    workArea,
  )
}

/**
 * Projects a dropped ball onto the closest edge of its work area, measured from
 * the ball's centre.
 *
 * Snapping from anywhere (not only within a few pixels of an edge) is what
 * keeps the ball out of the middle of the screen, where it would cover the
 * content the user is working on. The perpendicular coordinate is preserved,
 * but clamped so the ball cannot end up half off-screen.
 */
export function snapToNearestEdge(bounds: Rect, workArea: Rect): Point {
  const centreX = bounds.x + bounds.width / 2
  const centreY = bounds.y + bounds.height / 2

  const distances: ReadonlyArray<{ edge: 'left' | 'right' | 'top' | 'bottom'; distance: number }> = [
    { edge: 'left', distance: centreX - workArea.x },
    { edge: 'right', distance: workArea.x + workArea.width - centreX },
    { edge: 'top', distance: centreY - workArea.y },
    { edge: 'bottom', distance: workArea.y + workArea.height - centreY },
  ]

  // `<` (not `<=`) keeps the tie-break order above deterministic.
  const nearest = distances.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  )

  const snapped: Point = { x: bounds.x, y: bounds.y }
  switch (nearest.edge) {
    case 'left':
      snapped.x = workArea.x
      break
    case 'right':
      snapped.x = workArea.x + workArea.width - bounds.width
      break
    case 'top':
      snapped.y = workArea.y
      break
    case 'bottom':
      snapped.y = workArea.y + workArea.height - bounds.height
      break
  }

  return clampToWorkArea(snapped, bounds, workArea)
}

/** One attached display, reduced to what the ball math needs. */
export type DisplayInfo = { id: number; workArea: Rect }

/** What the app persists about the ball between launches. */
export type BallGeometry = { displayId: number | null; x: number; y: number }

export type ResolvedBallPosition = { displayId: number; x: number; y: number }

/**
 * Decides where the ball belongs at launch.
 *
 * The saved display id is authoritative so a multi-monitor arrangement is
 * restored as-is. An unplugged display (or a first launch) falls back to the
 * primary display's corner rather than to absolute coordinates that could now
 * point at nothing.
 */
export function resolveBallPosition(
  geometry: BallGeometry,
  size: Size,
  displays: readonly DisplayInfo[],
  primaryDisplayId: number,
  margin = DEFAULT_BALL_MARGIN,
): ResolvedBallPosition {
  const saved =
    geometry.displayId === null
      ? undefined
      : displays.find((display) => display.id === geometry.displayId)

  if (saved) {
    return { displayId: saved.id, ...clampToWorkArea(geometry, size, saved.workArea) }
  }

  const primary =
    displays.find((display) => display.id === primaryDisplayId) ?? displays[0]

  if (!primary) {
    // Electron always reports at least one display; this keeps the caller total.
    return { displayId: primaryDisplayId, x: geometry.x, y: geometry.y }
  }

  return { displayId: primary.id, ...defaultBallPosition(size, primary.workArea, margin) }
}
