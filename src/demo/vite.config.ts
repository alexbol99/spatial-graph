import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  plugins: [vue()],
  resolve: {
    // Run the demo against the live sources, so it needs no prior `pnpm build`.
    alias: { '@flatten-js/spatial-graph': here('../index.ts') },
  },
  server: { host: 'localhost', port: 5173 },
  build: { outDir: here('../../demo-dist'), emptyOutDir: true },
});
