import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// GitHub Pages has no rewrite rules, so each app URL needs a file to serve:
// - cart.html and orders.html make /cart and /orders answer 200 directly (Pages resolves extensionless paths).
// - 404.html catches everything else (/order/{id}) and boots the same app.
function pagesFallbacks(): Plugin {
  return {
    name: 'pages-fallbacks',
    apply: 'build',
    closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist')
      for (const name of ['cart.html', 'orders.html', '404.html']) {
        copyFileSync(resolve(dist, 'index.html'), resolve(dist, name))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pagesFallbacks()],
})
