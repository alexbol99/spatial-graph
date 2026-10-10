import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(), 'spatial-graph-browser-'));
let browser;
try {
  await build({ entryPoints: ['scripts/browser-smoke.ts'], outfile: join(directory, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife' });
  await writeFile(join(directory, 'index.html'), '<!doctype html><meta charset="utf-8"><body><script src="bundle.js"></script></body>');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(pathToFileURL(join(directory, 'index.html')).href);
  assert.deepEqual(errors, []); assert.equal(await page.locator('body').textContent(), 'passed');
  console.log(`Chromium ${browser.version()} built-package smoke passed`);
} finally { await browser?.close(); await rm(directory, { recursive: true, force: true }); }
