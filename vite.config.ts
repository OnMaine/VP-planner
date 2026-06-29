import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables" as *;\n`,
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
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/anthropic/, ''),
      },
      '/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/groq/, ''),
      },
      '/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/gemini/, ''),
      },
      '/game-proxy': {
        target: 'https://ru100.voynaplemyon.com',
        changeOrigin: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router: (req: any) => {
          const match = req.url?.match(/^\/game-proxy\/([^/]+)\//)
          return match ? `https://${match[1]}.voynaplemyon.com` : 'https://ru100.voynaplemyon.com'
        },
        rewrite: (path: string) => path.replace(/^\/game-proxy\/[^/]+/, ''),
      } as any,
    },
  },
})
