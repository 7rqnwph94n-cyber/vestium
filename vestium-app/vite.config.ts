import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { studioApiPlugin } from './vite-studio-api';

export default defineConfig({
  plugins: [react(), studioApiPlugin()],
  build: {
    chunkSizeWarningLimit: 1000,
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !dep.includes('studio'))
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) {
            return 'vendor-router';
          }
          if (id.includes('/src/features/studio/') || id.includes('node_modules/@anthropic-ai/sdk') || id.includes('node_modules/zod')) {
            return 'studio';
          }
          return undefined;
        }
      }
    }
  }
});
