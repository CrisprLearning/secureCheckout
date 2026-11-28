import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// GitHub Pages has no rewrite rules, so each app URL needs a file to serve:
// - cart.html and payment.html make /cart and /payment answer 200 directly (Pages resolves extensionless paths).
// - 404.html catches everything else and boots the same app, which shows its own not-found screen.
function pagesFallbacks(): Plugin {
  return {
    name: 'pages-fallbacks',
    apply: 'build',
    closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist')
      for (const name of ['cart.html', 'payment.html', '404.html']) {
        copyFileSync(resolve(dist, 'index.html'), resolve(dist, name))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pagesFallbacks()],
  build: {
    rollupOptions: {
      // bridge.html is the add-to-cart bridge the main site loads in a hidden frame (src/bridge.ts).
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        bridge: resolve(import.meta.dirname, 'bridge.html'),
      },
    },
  },
})
