import { defineConfig } from 'tsdown';
import { readFileSync } from 'node:fs';

const rbushLicense = readFileSync(new URL('./node_modules/rbush/LICENSE', import.meta.url), 'utf8');
const quickselectLicense = readFileSync(
  new URL('./licenses/quickselect.txt', import.meta.url),
  'utf8',
);

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // RBush 4 is ESM-only; bundle it so the synchronous CJS entry remains usable.
  deps: { alwaysBundle: ['rbush', 'quickselect'], onlyBundle: ['rbush', 'quickselect'] },
  banner: `/*! Bundled RBush:\n${rbushLicense}\nBundled quickselect:\n${quickselectLicense}*/`,
});
