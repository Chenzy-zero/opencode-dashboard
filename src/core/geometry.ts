/**
 * Geometry shared by the panel and the ball.
 *
 * Both are frameless windows placed in Electron's DIP coordinate space, where
 * values can be negative on a display left of or above the primary one. Keeping
 * the primitives in one place means the two placement rules cannot drift apart.
 */
export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }
export type Point = { x: number; y: number }

/** Clamps into `[min, max]`; if the range is inverted the max wins. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
