
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Prioritize VITE_API_KEY if exists, otherwise API_KEY.
  // fallback to the provided key if no env vars are set (e.g. on Vercel without config)
  const apiKey = process.env.VITE_API_KEY || process.env.API_KEY || env.VITE_API_KEY || env.API_KEY || "AIzaSyC6KcojG7D2Uq_lHryo9c3v6wmuDtT9Rm0";

  return {
    plugins: [react()],
    define: {
      // Inject API_KEY. We also support VITE_API_KEY as a standard Vite fallback.
      'process.env.API_KEY': JSON.stringify(apiKey),
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
