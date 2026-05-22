import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = dirname(fileURLToPath(import.meta.url))

const basePath = '/street-naming-map'

// https://vite.dev/config/
export default defineConfig({
  base: '/street-naming-map/',
  plugins: [
    react(),
    {
      name: 'redirect-base-path-without-trailing-slash',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const [path, query = ''] = (req.url ?? '').split('?')
          if (path === basePath) {
            const suffix = query ? `?${query}` : ''
            res.writeHead(308, { Location: `${basePath}/${suffix}` })
            res.end()
            return
          }
          next()
        })
      },
    },
    {
      name: 'copy-index-for-spa-fallback',
      closeBundle() {
        const outDir = join(rootDir, 'dist')
        const indexPath = join(outDir, 'index.html')
        const fallbackPath = join(outDir, '404.html')
        if (existsSync(indexPath)) {
          copyFileSync(indexPath, fallbackPath)
        }
      },
    },
  ],
  server: {
    host: true,
  },
  build: {
    sourcemap: true,
  },
})
