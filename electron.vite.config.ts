import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        output: {
          // package.json is ESM, but sandboxed preload scripts must be CJS:
          // Electron does not support ESM preloads in sandboxed renderers.
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    build: {
      rollupOptions: {
        // Two surfaces, two pages: the detail panel and the floating ball.
        // Each window loads its own HTML from the same dev server or out/.
        input: {
          index: resolve('src/renderer/index.html'),
          ball: resolve('src/renderer/ball.html'),
        },
      },
    },
  },
})
