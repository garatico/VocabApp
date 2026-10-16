import { defineConfig } from 'vite';
import { resolve } from 'path';
import { rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { cspString, THEME_BOOT_SCRIPT } from './src/server/lib/csp.ts';

export default defineConfig({
  root: '.',

  // Serve static assets (CSS, images, fonts) from public/
  publicDir: 'public',

  plugins: [
    {
      // Every page gets the theme boot script near the top of <head>, and every *built* page the Content
      // Security Policy as a meta tag — the one place the static site, the Windows app and the Android app
      // can all take it from (see src/server/lib/csp.ts). Not in dev: Vite's own client injects inline code.
      // Both go right after <meta charset>, which must stay within the page's first 1024 bytes.
      name: 'csp-and-theme-boot',
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          const csp = ctx.server ? '' : `<meta http-equiv="Content-Security-Policy" content="${cspString()}">
`;
          const add = `${csp}<script>${THEME_BOOT_SCRIPT}</script>
`;
          const charset = /<meta charset="[^"]*"\s*\/?>\s*/i;
          if (!charset.test(html)) throw new Error('csp-and-theme-boot: page has no <meta charset>');
          return html.replace(charset, m => m + add);
        },
      },
    },
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
    {
      // sw.js's caches are named after CACHE_VERSION, which used to be bumped by
      // hand — forget once and returning visitors kept a stale shell. Stamp it
      // with a hash of the emitted bundle instead, so every real change to the
      // app evicts the old caches and an unchanged rebuild keeps them.
      name: 'stamp-service-worker',
      apply: 'build',
      closeBundle() {
        const swPath = resolve('./dist/sw.js');
        if (!existsSync(swPath)) return;
        const hash = createHash('sha256');
        const assets = resolve('./dist/assets');
        if (existsSync(assets)) {
          // Hashed filenames already encode content; the name list is enough.
          hash.update(readdirSync(assets).sort().join('|'));
        }
        hash.update(readFileSync(resolve('./dist/index.html')));
        const id = hash.digest('hex').slice(0, 10);
        writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__BUILD_ID__', id));
      },
    },
    {
      // public/styles/*.css still has to live under publicDir so
      // src/client/(admin/)styles-entry.css's `@import "/styles/...`
      // resolves at build time — but publicDir also gets copied into dist/
      // verbatim, and nothing links to those raw files anymore now that
      // they're bundled into one hashed app.css/admin.css (see
      // styles-entry.css's own header comment). Left in place they're pure
      // dead weight in every build output — dist/, the web deploy, and the
      // Tauri installer alike. Only runs for `vite build`, not the dev
      // server, where publicDir is served directly rather than copied.
      name: 'drop-unused-public-styles',
      apply: 'build',
      closeBundle() {
        rmSync(resolve('./dist/styles'), { recursive: true, force: true });
      },
    },
  ],

  server: {
    port: 5173,
    // Transform the app's and the admin panel's import graphs when the server starts, not on the first
    // page load: cold, that first load took long enough (hundreds of modules on demand) that the opening
    // e2e specs of a fresh run timed out in page.goto, and a developer's first refresh waited too.
    warmup: {
      clientFiles: ['./src/client/app.ts', './src/client/admin/admin.ts'],
    },
    proxy: {
      // Forward all API calls and static asset requests to Express
      '/api':    { target: 'http://localhost:3000', changeOrigin: true },
      '/svgs':   { target: 'http://localhost:3000', changeOrigin: true },
      '/images': { target: 'http://localhost:3000', changeOrigin: true },
      '/emoji':  { target: 'http://localhost:3000', changeOrigin: true },
      '/audio':  { target: 'http://localhost:3000', changeOrigin: true },
      // Note: /admin removed — Vite now serves admin.html directly
    },
    // Cross-origin isolation lets WebLLM's WASM runtime (ai-chat/webllm-engine.ts)
    // use SharedArrayBuffer for multi-threaded inference. Not required — it
    // falls back to a slower single-threaded path without these — but free
    // to enable since CSP is off and nothing else on this dev server needs
    // to embed cross-origin content without CORP.
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  // `vite preview` (serving the built dist/ bundle) needs the same proxy as
  // `vite dev` — without it, /api/* falls through to Vite's own static
  // resolution and gets the SPA's index.html back with a 200, which is what
  // produced the admin panel's "Unexpected token '<'" JSON-parse error.
  preview: {
    proxy: {
      '/api':    { target: 'http://localhost:3000', changeOrigin: true },
      '/svgs':   { target: 'http://localhost:3000', changeOrigin: true },
      '/images': { target: 'http://localhost:3000', changeOrigin: true },
      '/emoji':  { target: 'http://localhost:3000', changeOrigin: true },
      '/audio':  { target: 'http://localhost:3000', changeOrigin: true },
    },
  },

  // The AI Chat tab's model runs off the UI thread in webllm-worker.ts — the
  // first Worker in this codebase. Built as ESM to match what WebLLM's own
  // worker helper (CreateWebWorkerMLCEngine) expects.
  worker: {
    format: 'es',
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
