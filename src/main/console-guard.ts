import { diag } from './diagnostics.ts'

/**
 * Launchpad/Finder starts the app without a usable stderr: the descriptor is
 * there but every write fails with EIO. Node prints `process.emitWarning` and
 * `console.error` output straight to it, so the failing write surfaces as an
 * uncaught exception and Electron replaces the menu-bar app with a crash
 * dialog.
 *
 * Two guards, both cheap:
 * 1. An `error` listener on stdout/stderr turns that stream failure into a
 *    no-op instead of an uncaught exception.
 * 2. A last-resort handler logs anything that still escapes to
 *    `diagnostics.log` and keeps the tray alive. A transient IO failure must
 *    never make the widget vanish; a real bug stays visible and traceable.
 */
export function installProcessGuards(): void {
  const ignore = (): void => {}
  process.stdout.on('error', ignore)
  process.stderr.on('error', ignore)

  process.on('uncaughtException', (error) => {
    diag('uncaught', { message: error.message, stack: error.stack })
  })
  process.on('unhandledRejection', (reason) => {
    diag('unhandled-rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
    })
  })
}
