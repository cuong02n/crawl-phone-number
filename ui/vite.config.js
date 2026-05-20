import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8999,
    proxy: {
      '/api': 'http://127.0.0.1:9000',
      '/ws':  { target: 'ws://127.0.0.1:9000', ws: true, changeOrigin: true }
    }
  }
})
