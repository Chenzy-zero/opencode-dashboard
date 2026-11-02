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
  renderer: {},
})
