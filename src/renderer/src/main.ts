import type { PanelView } from '../../core/panel-view.ts'
import type { PanelApi } from '../../shared/api.ts'
import './style.css'

const api = (window as unknown as { panelApi?: PanelApi }).panelApi

function mustElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`panel markup is missing: ${selector}`)
  return element
}

const rowsElement = mustElement<HTMLDivElement>('#rows')
const statusElement = mustElement<HTMLDivElement>('#status')
const statusReasonElement = mustElement<HTMLDivElement>('#status-reason')
const statusHintElement = mustElement<HTMLParagraphElement>('#status-hint')
const retryElement = mustElement<HTMLButtonElement>('#retry')
const refreshingElement = mustElement<HTMLSpanElement>('#refreshing')
const footerElement = mustElement<HTMLElement>('#footer')

function renderRow(row: NonNullable<PanelView['rows']>[number]): HTMLElement {
  const element = document.createElement('div')
  element.className = row.limited ? 'row limited' : 'row'
  element.dataset['key'] = row.key

  const head = document.createElement('div')
  head.className = 'row-head'

  const name = document.createElement('span')
  name.className = 'row-name'
  name.textContent = row.name
  head.append(name)

  if (row.limitedText) {
    const badge = document.createElement('span')
    badge.className = 'row-limit'
    badge.textContent = row.limitedText
    head.append(badge)
  }

  const remaining = document.createElement('span')
  remaining.className = 'row-remaining'
  remaining.textContent = row.percentText
  head.append(remaining)

  const bar = document.createElement('div')
  bar.className = 'bar'
  const fill = document.createElement('div')
  fill.className = 'bar-fill'
  fill.style.width = `${row.percent}%`
  bar.append(fill)

  const reset = document.createElement('div')
  reset.className = 'row-reset'
  reset.textContent = row.resetText

  element.append(head, bar, reset)
  return element
}

function render(view: PanelView): void {
  document.body.dataset['status'] = view.status
  // Always in the DOM, only faded in: the header never reflows mid-refresh.
  refreshingElement.dataset['active'] = String(view.isRefreshing)

  if (view.rows) {
    rowsElement.replaceChildren(...view.rows.map(renderRow))
    rowsElement.hidden = false
    statusElement.hidden = true
  } else {
    // Failure state: the reason names the problem, the hint names the next
    // step, and 「重试」 re-runs the poll. All three strings come from core;
    // no percentage is ever passed down here alongside a failure.
    rowsElement.replaceChildren()
    rowsElement.hidden = true
    statusElement.hidden = false
    // Core owns the vocabulary, including the neutral 「正在读取…」 state.
    statusReasonElement.textContent = view.statusText ?? ''
    statusHintElement.textContent = view.statusHint ?? ''
    statusHintElement.hidden = !view.statusHint
    retryElement.textContent = view.retryLabel ?? ''
    retryElement.hidden = !view.retryLabel
  }

  footerElement.textContent = view.updatedAtText
}

retryElement.addEventListener('click', () => {
  api?.retry()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') api?.hide()
})

api?.onView(render)
