import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@components': '/src/components'
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // Your Express server port
        changeOrigin: true,
      },
    },
  }
});
