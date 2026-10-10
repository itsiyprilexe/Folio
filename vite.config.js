import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Avoid native realpath calls, which can be blocked in restricted Windows workspaces.
    preserveSymlinks: true
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
