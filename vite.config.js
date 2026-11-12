import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В разработке фронт идёт через Vite (5173), а /api проксируется на scripts/dev-api.mjs (3001).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
