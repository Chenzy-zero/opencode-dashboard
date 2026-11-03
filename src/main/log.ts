import { app } from 'electron'

/**
 * Development breadcrumb. Packaged builds stay quiet: the menu bar has no
 * console, and a signed-in user's usage state is not something to spray into a
 * log file. Errors still use console.error everywhere.
 */
export function devLog(...args: unknown[]): void {
  if (app.isPackaged) return
  console.log(...args)
}
