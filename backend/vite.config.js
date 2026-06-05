import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Root is backend/ so that src/client/app.ts resolves to backend/src/client/app.ts
  root: '.',

  // Serve static assets (CSS, images, fonts) from public/
  publicDir: 'public',

  plugins: [
    {
      // Rewrite /admin → /admin.html so the Vite dev server serves it without .html
      name: 'admin-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/admin') req.url = '/admin.html';
          next();
        });
      },
    },
  ],

  server: {
    port: 5173,
    proxy: {
      // Forward all API calls and static asset requests to Express
      '/api':    { target: 'http://localhost:3000', changeOrigin: true },
      '/svgs':   { target: 'http://localhost:3000', changeOrigin: true },
      '/images': { target: 'http://localhost:3000', changeOrigin: true },
      '/emoji':  { target: 'http://localhost:3000', changeOrigin: true },
      // Note: /admin removed — Vite now serves admin.html directly
    },
  },

  // `vite build` output
  build: {
    outDir:     'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app:   resolve('./index.html'),
        admin: resolve('./admin.html'),
      },
    },
  },
});
