import { defineConfig } from 'tsdown';
import { readFileSync } from 'node:fs';

const rbushLicense = readFileSync(new URL('./node_modules/rbush/LICENSE', import.meta.url), 'utf8');
const quickselectLicense = readFileSync(
  new URL('./licenses/quickselect.txt', import.meta.url),
  'utf8',
);
const knnLicense = readFileSync(
  new URL('./node_modules/rbush-knn/LICENSE', import.meta.url),
  'utf8',
);
const tinyqueueLicense = readFileSync(new URL('./licenses/tinyqueue.txt', import.meta.url), 'utf8');

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // Bundle spatial-index dependencies so the synchronous CJS entry remains usable.
  deps: {
    alwaysBundle: ['rbush', 'quickselect', 'rbush-knn', 'tinyqueue'],
    onlyBundle: ['rbush', 'quickselect', 'rbush-knn', 'tinyqueue'],
  },
  banner: `/*! Bundled RBush:\n${rbushLicense}\nBundled quickselect:\n${quickselectLicense}\nBundled rbush-knn:\n${knnLicense}\nBundled tinyqueue:\n${tinyqueueLicense}*/`,
});
