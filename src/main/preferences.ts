import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DEFAULT_BALL_STATE, parseBallState, serializeBallState, type BallState } from '../core/ball-state.ts'

export type BallStateStore = {
  /** Never throws: an unreadable file means "first launch". */
  load: () => BallState
  /** Best-effort; a failed write must not take the app down. */
  save: (state: BallState) => void
}

/**
 * Tiny JSON file in `app.getPath('userData')`.
 *
 * Preference-like data does not belong in the repo or in the project's
 * service.json, and it is too small for a dependency. Writes go through a
 * temporary file so a crash mid-write cannot leave truncated JSON behind.
 */
export function createBallStateStore(filePath: string): BallStateStore {
  return {
    load() {
      try {
        return parseBallState(readFileSync(filePath, 'utf8'))
      } catch {
        // ENOENT on first launch, EACCES on a permissions accident, a directory
        // in place of the file: all mean "no usable preferences".
        return { ...DEFAULT_BALL_STATE }
      }
    },

    save(state) {
      try {
        mkdirSync(dirname(filePath), { recursive: true })
        const temporary = `${filePath}.tmp`
        writeFileSync(temporary, serializeBallState(state), 'utf8')
        renameSync(temporary, filePath)
      } catch (error) {
        console.error(
          '[prefs] could not save ball state:',
          error instanceof Error ? error.message : error,
        )
      }
    },
  }
}
