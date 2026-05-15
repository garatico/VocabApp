import { defineConfig } from 'vite';

export default defineConfig({
  // Vite root = the folder that contains index.html
  root: 'public',

  server: {
    port: 5173,
    proxy: {
      // Forward all API calls and SVG requests to Express
      '/api':  { target: 'http://localhost:3000', changeOrigin: true },
      '/svgs': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },

  // `vite build` output — Express can serve this in production instead of public/
  build: {
    outDir:     '../dist',
    emptyOutDir: true,
  },
});
