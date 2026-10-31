import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Only include frontend tests — API package tests run under their own config
    // (apps/api/vitest.config.ts, environment: node) via pnpm --filter @complianceforge/api test.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'vite-studio-api.test.ts'],
  }
});
