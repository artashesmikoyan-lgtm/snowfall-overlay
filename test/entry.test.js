import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createSnowfall } from 'snowfall-overlay';

test('ESM entry can be imported on the server', () => {
  assert.equal(typeof createSnowfall, 'function');
  assert.throws(() => createSnowfall(), /document body/);
});

test('classic script exposes the same entry point', async () => {
  const sandbox = {};
  runInNewContext(await readFile(new URL('../browser.js', import.meta.url), 'utf8'), sandbox);
  assert.equal(typeof sandbox.SnowfallOverlay.createSnowfall, 'function');
});
