import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: 'https://jouhayerk-cloud.github.io/onyx.mx/',
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
        mode === 'development' ? basicSsl() : null,
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            workbox: {
                // Cache all compiled assets permanently
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                // Large chunks (Three.js, PDF libs) — still cache
                maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8MB
                runtimeCaching: [
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
                        // Google Drive images — cache-first
                        urlPattern: /drive\.google\.com/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'media-cache',
                            expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
                        },
                    },
                ],
                // SPA fallback
                navigateFallback: '/index.html',
                navigateFallbackAllowlist: [/^(?!\/__).*/],
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
                icons: [
                    // 'any' and 'maskable' are deliberately separate entries.
                    // A maskable icon is cropped to the platform's shape with
                    // roughly a 20% safe zone, so a mark that was not drawn
                    // with that padding loses its edges. Declaring one file as
                    // both let Android crop the full-bleed logo.
                    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
                    { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
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
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'jotai'],
            'vendor-charts': ['echarts-for-react', 'echarts'],
            'vendor-db': ['rxdb', 'rxjs'],
            // Split icons/animation/export libs so they're loaded independently
            'vendor-icons': ['lucide-react'],
            'vendor-animation': ['gsap', 'framer-motion'],
            'vendor-excel': ['xlsx', 'exceljs'],
            'vendor-pdf': ['jspdf', 'jspdf-autotable', 'html2canvas'],
            'vendor-3d': ['three'],
            'vendor-ai': ['@google/genai', '@google/generative-ai'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-qrcode': ['html5-qrcode', 'qrcode.react', 'react-barcode']
          }
        }
      }
    }
  };
});
