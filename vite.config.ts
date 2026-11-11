import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/soldi/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Soldi',
        short_name: 'Soldi',
        description: 'Il tuo patrimonio, le tue spese, le tue abitudini.',
        lang: 'it',
        theme_color: '#0F4D3A',
        background_color: '#F2F4F1',
        display: 'standalone',
        start_url: '/soldi/',
        scope: '/soldi/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1500 },
})
