
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Robustly define process.env.API_KEY.
      // It checks Vercel's system env first, then the loaded .env file.
      // If neither exists, it defaults to an empty string (handled in geminiService.ts).
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY || ""),
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
          output: {
              manualChunks(id) {
                  if (id.includes('node_modules')) {
                      return 'vendor';
                  }
              }
          }
      }
    },
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  };
});
