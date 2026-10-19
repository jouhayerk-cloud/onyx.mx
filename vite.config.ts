import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Bump with every icon redesign. Browsers, iOS and installed apps cache icons
// by URL, so an unchanged URL keeps showing the old cube. This one value is
// appended as ?v= to every icon link in index.html (the __ICON_VERSION__
// placeholder) and to every icon in the web app manifest below.
const ICON_VERSION = '1.87';

// Identifies one build. index.html's start-up safety net (the __BUILD_ID__
// placeholder) allows its service-worker and cache reset at most once per build,
// so a deploy that fixes a broken page re-arms it and a persistent failure
// cannot loop.
const BUILD_ID = `${pkg.version}-${Date.now().toString(36)}`;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === 'development' ? '/' : (process.env.VITE_BASE_URL || '/onyx.mx/'),
    assetsInclude: ['**/*.usdz', '**/*.glb'],
    server: {
      port: 1001,
      host: '0.0.0.0',
      https: mode === 'development' ? {} : false,
      allowedHosts: ['.loca.lt'],
    },
    plugins: [
        react(),
        tailwindcss(),
        {
            name: 'onyx-icon-version',
            // 'pre' so Vite still prefixes `base` onto the rewritten icon URLs.
            transformIndexHtml: { order: 'pre', handler: (html: string) => html.replaceAll('__ICON_VERSION__', ICON_VERSION).replaceAll('__BUILD_ID__', BUILD_ID) },
        },
        mode === 'development' ? basicSsl() : null,
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            workbox: {
                cleanupOutdatedCaches: true,
                skipWaiting: true,
                clientsClaim: true,
                // Precache = the app shell plus the views a warehouse phone needs
                // with no signal. Measured on 2026-10-16: everything under
                // dist/**/*.{js,css,html} was 135 entries / 14.0 MB, which every
                // first install downloaded on mobile data. The heavy lazy chunks
                // below are NOT precached; the runtime rules cache each one the
                // first time it is used (CacheFirst, the file names are hashed),
                // so offline use still works for everything the device has opened.
                // Media (public/hero, public/img, mascots, tutorial) and the
                // Affinity (.af) brand sources were never in the globs and must
                // not be added.
                globPatterns: ['**/*.{js,css,html}', 'favicon.png', 'favicon.svg', 'apple-touch-icon*.png', 'icon-192.png'],
                globIgnores: [
                    // Export and print libraries: only loaded when a user exports.
                    'assets/vendor-excel-*.js',
                    'assets/vendor-pdf-*.js',
                    // 3D viewer, in-browser embeddings runtime and AI SDKs: optional features.
                    'assets/vendor-3d-*.js',
                    'assets/vendor-ai-*.js',
                    // ECharts (1.1 MB): only the chart views load it, never the shell.
                    'assets/vendor-charts-*.js',
                    'assets/ort*.js',
                    // Brand/catalogue data chunk and the settings portal (0.7 MB, opened rarely).
                    'assets/rareEarthLogo-*.js',
                    'assets/StudioSettingsPortal-*.js',
                    // Label-printer designer iframe: needs Bluetooth hardware, not offline work.
                    'phomemo-designer/**',
                    // The 512 px icons are fetched by the installer through the manifest.
                    'icon-512.png',
                    'icon-maskable-512.png',
                    '**/*.af',
                ],
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
                runtimeCaching: [
                    {
                        // Lazy chunks left out of the precache. Hashed names never change
                        // content, so cache-first is safe; old hashes age out after 30 days.
                        urlPattern: /\/assets\/[^/]+\.(?:js|mjs|css)$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'lazy-chunks',
                            cacheableResponse: { statuses: [200] },
                            expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
                        },
                    },
                    {
                        // Label designer iframe: files are not hashed, so revalidate.
                        urlPattern: /\/phomemo-designer\//,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'phomemo-designer',
                            cacheableResponse: { statuses: [200] },
                            expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
                        },
                    },
                    {
                        // Supabase API — network-first, fallback to cache
                        urlPattern: /supabase\.co\/rest\//,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'supabase-api',
                            networkTimeoutSeconds: 5,
                            expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
                        },
                    },
                    {
                        // App images and icons loaded at runtime
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'static-assets-cache',
                            expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
                        },
                    },
                    {
                        // Google Drive images — cache-first
                        urlPattern: /drive\.google\.com/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'media-cache',
                            expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
                        },
                    },
                ],
                // SPA fallback. RELATIVE on purpose: workbox resolves it against
                // sw.js (/onyx.mx/sw.js). '/index.html' pointed at the domain root,
                // which isn't precached, so workbox threw 'non-precached-url' while
                // evaluating sw.js and the service worker never installed: from
                // 2026-05-02 to 2026-09-30 offline mode never ran.
                navigateFallback: 'index.html',
                navigateFallbackAllowlist: [/^(?!\/__).*/],
                // The Phomemo designer is its own page (opened in an iframe): never answer it with the app shell.
                navigateFallbackDenylist: [/\/phomemo-designer\//],
            },
            // Every path here is RELATIVE, and that is the whole point. The site
            // is served from /onyx.mx/, not from the domain root, so a leading
            // slash escapes the app: the previous manifest asked for
            // /OnyxLogo.png and /OnyxMini.svg (both 404) and declared
            // start_url '/' (also 404, that is the GitHub Pages root). The
            // installed app therefore had no icon it could fetch and a launch
            // URL that did not exist. Relative paths resolve against `scope`,
            // which vite-plugin-pwa fills in from `base`.
            //
            // OnyxMini.svg does not exist in public/ at all and has been
            // dropped rather than repointed — it 404s at every path.
            manifest: {
                id: './',
                name: 'Onyx — Inventory & Logistics',
                short_name: 'Onyx',
                description: 'Warehouse inventory management, crate packing, and logistics for Jouhayerk',
                theme_color: '#0a0a0a',
                background_color: '#0a0a0a',
                display: 'standalone',
                orientation: 'any',
                start_url: './',
                scope: '/onyx.mx/',
                icons: [
                    // 'any' and 'maskable' are deliberately separate entries.
                    // A maskable icon is cropped to the platform's shape with
                    // roughly a 20% safe zone, so a mark that was not drawn
                    // with that padding loses its edges. Declaring one file as
                    // both let Android crop the full-bleed logo.
                    { src: `icon-192.png?v=${ICON_VERSION}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: `icon-512.png?v=${ICON_VERSION}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
                    // The abalone cube sits inside the central 80% circle
                    // (checked against its corners), so the same render is
                    // safe to crop as maskable.
                    { src: `icon-maskable-512.png?v=${ICON_VERSION}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                    { src: `apple-touch-icon-dark.png?v=${ICON_VERSION}`, sizes: '180x180', type: 'image/png', purpose: 'any' },
                    { src: `apple-touch-icon.png?v=${ICON_VERSION}`, sizes: '180x180', type: 'image/png', purpose: 'any' },
                    { src: `favicon.png?v=${ICON_VERSION}`, sizes: '64x64', type: 'image/png', purpose: 'any' },
                    { src: `favicon.svg?v=${ICON_VERSION}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                ],
                categories: ['business', 'productivity', 'utilities'],
            },
        }),
    ].filter(Boolean),
    // ⚠️  SECURITY: loadEnv() above uses an empty prefix, so `env` contains
    // EVERY variable from .env.local — including SUPABASE_SERVICE_ROLE_KEY
    // when the MCP server is configured. Only the keys listed below are
    // inlined into the client bundle. NEVER spread `...env` into this object
    // or add non-VITE_ keys. The service role key must never reach the
    // browser or the GitHub Pages static deployment.
    // See also: .env.example lines 18-21 (retired VITE_CYPHER_KEY warning).
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
      'import.meta.env.VITE_GEMINI_API_KEY': mode === 'development' ? JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY) : '""',
      __APP_VERSION__: JSON.stringify(pkg.version),
      'import.meta.env.VITE_CYPHER_KEY': JSON.stringify(env.VITE_CYPHER_KEY),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      }
    },
    build: {
      target: 'esnext',
      minify: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          viewer: fileURLToPath(new URL('./iFrameViewer.html', import.meta.url)),
        },
        output: {
          // Function form: same vendor groups as before, plus Vite's own preload helper in a chunk of its
          // own. In the object form the helper landed in vendor-pdf, so the entry modulepreloaded jspdf.
          manualChunks(id: string) {
            if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vite-runtime';
            if (!id.includes('node_modules')) return undefined;
            const groups: Record<string, string[]> = {
              'vendor-react': ['react', 'react-dom', 'jotai', 'scheduler'],
              'vendor-charts': ['echarts-for-react', 'echarts', 'zrender'],
              'vendor-db': ['rxdb', 'rxjs'],
              'vendor-icons': ['lucide-react'],
              'vendor-framer': ['framer-motion', 'motion-dom', 'motion-utils'],
              'vendor-gsap': ['gsap'],
              'vendor-excel': ['xlsx', 'exceljs', 'jszip'],
              'vendor-pdf': ['jspdf', 'jspdf-autotable', 'html2canvas'],
              'vendor-3d': ['three'],
              'vendor-ai': ['@google/genai', '@google/generative-ai'],
              'vendor-supabase': ['@supabase'],
              'vendor-qrcode': ['html5-qrcode', 'qrcode.react', 'react-barcode'],
            };
            const m = id.split(String.fromCharCode(92)).join('/').match(/node_modules[/]((?:@[^/]+[/])?[^/]+)/);   // Windows paths use backslashes
            const pkg = m ? m[1] : '';
            for (const [chunk, pkgs] of Object.entries(groups)) {
              if (pkgs.some(p => pkg === p || pkg.startsWith(p + '/'))) return chunk;
            }
            return undefined;
          }
        }
      }
    }
  };
});


