import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_DEPLOY_TARGET is set by CI ("edge" | "stable"). Local builds default to edge.
const target = process.env.VITE_DEPLOY_TARGET || 'edge';
const isStable = target === 'stable';
const base = isStable ? '/grimoire/' : '/grimoire/edge/';
const dbName = isStable ? 'grimoire-stable' : 'grimoire';

export default defineConfig({
  base,
  server: { host: true },
  define: {
    __GRIMOIRE_DB__: JSON.stringify(dbName),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: isStable ? 'Grimoire' : 'Grimoire Edge',
        short_name: isStable ? 'Grimoire' : 'Grimoire Edge',
        description: 'Personal reference card wiki',
        theme_color: '#1a1714',
        background_color: '#1a1714',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});