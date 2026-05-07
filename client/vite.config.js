import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Single proxy for everything API-related. ws: true makes WebSocket
      // upgrades on /api/ws forward to the server too — keeps our WS off
      // the top-level /ws path which conflicts with Vite's own HMR routing.
      '/api': { target: 'http://localhost:4000', ws: true },
      '/media': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
