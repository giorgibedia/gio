
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Default to empty string to prevent 'undefined' injection issues
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY || ""),
    },
    build: {
      outDir: 'dist', // Standard output directory for Vite
      chunkSizeWarningLimit: 1600, // Increase warning limit to 1600kb
      rollupOptions: {
          output: {
              manualChunks(id) {
                  // Split third-party libraries into a separate 'vendor' chunk
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
