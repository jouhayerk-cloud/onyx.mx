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
            manifest: {
                name: 'Onyx — Inventory & Logistics',
                short_name: 'Onyx',
                description: 'Warehouse inventory management, crate packing, and logistics for Jouhayerk',
                theme_color: '#0a0a0a',
                background_color: '#0a0a0a',
                display: 'standalone',
                orientation: 'any',
                start_url: '/',
                icons: [
                    { src: '/OnyxLogo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
                    { src: '/OnyxMini.svg', sizes: 'any', type: 'image/svg+xml' },
                ],
                categories: ['business', 'productivity', 'utilities'],
            },
        }),
    ].filter(Boolean),
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
      chunkSizeWarningLimit: 4000,
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
            'vendor-utils': ['lucide-react', 'gsap', 'xlsx', 'exceljs'],
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