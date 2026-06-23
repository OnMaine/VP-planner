import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/assets/variables" as *;\n`,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/game-proxy': {
        target: 'https://ru100.voynaplemyon.com',
        changeOrigin: true,
        router: (req) => {
          const match = req.url?.match(/^\/game-proxy\/([^/]+)\//)
          return match ? `https://${match[1]}.voynaplemyon.com` : 'https://ru100.voynaplemyon.com'
        },
        rewrite: (path) => path.replace(/^\/game-proxy\/[^/]+/, ''),
      },
    },
  },
})
