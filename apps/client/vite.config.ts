import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'ES2022',
  },
  define: {
    'process.env': {},
  },
});
