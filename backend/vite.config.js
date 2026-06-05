import { defineConfig } from 'vite';

export default defineConfig({
  // Root is backend/ so that src/client/app.ts resolves to backend/src/client/app.ts
  root: '.',

  // Serve static assets (CSS, images, fonts) from public/
  publicDir: 'public',

  server: {
    port: 5173,
    proxy: {
      // Forward all API calls and static asset requests to Express
      '/api':    { target: 'http://localhost:3000', changeOrigin: true },
      '/svgs':   { target: 'http://localhost:3000', changeOrigin: true },
      '/images': { target: 'http://localhost:3000', changeOrigin: true },
      '/emoji':  { target: 'http://localhost:3000', changeOrigin: true },
      '/admin':  { target: 'http://localhost:3000', changeOrigin: true },
    },
  },

  // `vite build` output
  build: {
    outDir:     'dist',
    emptyOutDir: true,
  },
});
