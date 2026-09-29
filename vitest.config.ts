import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Examples import the package by name; test them against the sources.
    alias: {
      '@flatten-js/spatial-graph': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
