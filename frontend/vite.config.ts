import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Redirige las peticiones a /api hacia el backend de Express (puerto 4000)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
