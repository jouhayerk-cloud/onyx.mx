import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'fs';

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
        mode === 'development' ? basicSsl() : null
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
          }
        }
      }
    }
  };
});