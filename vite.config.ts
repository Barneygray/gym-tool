import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base is '/gym-tool/' in production for GitHub Pages hosting
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/gym-tool/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Forge — Gym Helper',
        short_name: 'Forge',
        description: 'Personal training log with progressive overload suggestions',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Keep the framework in its own chunk so a one-line app change doesn't
        // invalidate ~150 kB of unchanged vendor code in everyone's service
        // worker cache. Supabase and the tab screens are split by dynamic
        // import instead — see db/supabaseClient.ts and App.tsx.
        // Matched by module path, not package name: `main.tsx` imports
        // `react-dom/client`, which is a different module id from `react-dom`
        // and would otherwise be left behind in the entry chunk.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/]node_modules[\\/]dexie[\\/]/.test(id)) return 'db'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
}))
