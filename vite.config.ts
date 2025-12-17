import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  server: {
    port: 3000,
  },
  define: {
    // Inject WebSocket server URL at build time
    // Set WS_SERVER_URL env variable when building for production
    __WS_SERVER_URL__: JSON.stringify(process.env.WS_SERVER_URL || ''),
  },
});
