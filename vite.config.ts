import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Hosted at https://*.vercel.app/arcade and later 5Dimperial.com/arcade
export default defineConfig({
  base: '/arcade/',
  plugins: [react()],
  build: {
    outDir: 'dist/arcade',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
