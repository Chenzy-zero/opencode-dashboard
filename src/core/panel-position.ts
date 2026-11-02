export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }

const GAP = 4
const MARGIN = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Places the panel under the tray icon, centred horizontally, then keeps it
 * inside the display's work area. All values are DIP, like Electron's
 * `screen`/`setPosition`, so this is scale-safe. Flips above the anchor when
 * the menu bar sits at the bottom of the screen (or space is tight).
 */
export function panelPosition(
  anchor: Rect,
  panel: Size,
  workArea: Rect,
  gap = GAP,
  margin = MARGIN,
): { x: number; y: number } {
  const centred = Math.round(anchor.x + anchor.width / 2 - panel.width / 2)
  const x = clamp(centred, workArea.x + margin, workArea.x + workArea.width - panel.width - margin)

  const below = Math.round(anchor.y + anchor.height + gap)
  const above = Math.round(anchor.y - panel.height - gap)
  // Vertically the anchor wins over the margin: the panel should hug the tray,
  // not float an arbitrary distance below the menu bar.
  const y =
    below + panel.height > workArea.y + workArea.height
      ? clamp(above, workArea.y, workArea.y + workArea.height - panel.height)
      : clamp(below, workArea.y, workArea.y + workArea.height - panel.height)

  return { x, y }
}
