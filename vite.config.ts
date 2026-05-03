import { defineConfig } from 'vite'

export default defineConfig({
  base: '/rcube/',
  build: {
    chunkSizeWarningLimit: 700,
  },
})
