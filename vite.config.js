import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // allow access from network
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: [ 'localhost','127.0.0.1','f7a5dc4dc942.ngrok-free.app'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
