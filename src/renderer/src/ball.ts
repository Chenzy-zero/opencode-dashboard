import type { BallView } from '../../core/ball-view.ts'
import './ball.css'

type BallApi = {
  onView: (callback: (view: BallView) => void) => () => void
  onResetHitTest: (callback: () => void) => () => void
  setIgnoreMouse: (ignore: boolean) => void
  dragStart: () => void
  dragEnd: () => void
  showMenu: () => void
}

const api = (window as unknown as { ballApi?: BallApi }).ballApi

function mustElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`ball markup is missing: ${selector}`)
  return element
}

const disc = mustElement<HTMLDivElement>('#disc')
const value = mustElement<HTMLSpanElement>('#value')
const countdown = mustElement<HTMLDivElement>('#countdown')
const ring = mustElement<SVGCircleElement>('#ring')

/** r = 36 in the 80-unit viewBox: the arc starts at 12 o'clock and drains clockwise. */
const CIRCUMFERENCE = 2 * Math.PI * 36
ring.style.strokeDasharray = `${CIRCUMFERENCE}`

function render(view: BallView): void {
  document.body.dataset['level'] = view.level
  document.body.dataset['status'] = view.status

  value.textContent = view.text
  disc.title = view.tooltip
  disc.setAttribute('aria-label', view.tooltip)

  // `progress` is already 0 in every non-online state, so no stale arc can
  // survive a failed poll next to the dash.
  ring.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - view.progress / 100)}`

  countdown.textContent = view.countdown ?? ''
  countdown.hidden = view.countdown === null
}

/**
 * Transparent pixels are not click-through on their own (electron#1335), so the
 * window starts ignoring the mouse and this hit-test re-enables it only while
 * the pointer is over the disc or the countdown. `forward: true` in the main
 * process is what keeps these mousemove events coming.
 */
const HIT_SELECTOR = '.ball-disc, .ball-countdown'
let ignoring = true
let dragging = false

function setIgnore(ignore: boolean): void {
  if (ignore === ignoring) return
  ignoring = ignore
  api?.setIgnoreMouse(ignore)
}

window.addEventListener('mousemove', (event) => {
  if (dragging) return
  // elementFromPoint returns the innermost node (often the SVG path), so the
  // closest() check is what decides "over the ball".
  const overBall = document.elementFromPoint(event.clientX, event.clientY)?.closest(HIT_SELECTOR)
  setIgnore(overBall === null || overBall === undefined)
})

window.addEventListener('mouseleave', () => {
  if (dragging) return
  setIgnore(true)
})

disc.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  // Do not toggle ignore during the drag or pointerup never arrives.
  dragging = true
  disc.setPointerCapture(event.pointerId)
  api?.dragStart()
})

function endDrag(): void {
  if (!dragging) return
  dragging = false
  // The main process decides click vs drag from the cursor travel and snaps on
  // release, so the renderer never has to guess whether it moved.
  api?.dragEnd()
}

window.addEventListener('pointerup', endDrag)
window.addEventListener('pointercancel', endDrag)

window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  if (dragging) return
  api?.showMenu()
})

// Without this a slow press can start a text/image drag inside the disc.
window.addEventListener('dragstart', (event) => event.preventDefault())

api?.onView(render)

// The main process makes the window click-through again on every show; mirror
// that here so the next mousemove can re-enable hit-testing.
api?.onResetHitTest(() => {
  ignoring = true
  dragging = false
})
