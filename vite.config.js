import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/street-naming-map/',
  plugins: [react()],
  server: {
    host: true,
  },
  build: {
    sourcemap: true,
  },
})
