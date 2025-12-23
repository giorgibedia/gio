
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify("AIzaSyAoq6me5wOo81sxBtcj3lzj5IZ2Skvj9NE"),
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
});
