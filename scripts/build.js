import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
await writeFile(new URL('../browser.js', import.meta.url),
  `(() => {\n'use strict';\n${source.replace('export function createSnowfall', 'function createSnowfall')}\nglobalThis.SnowfallOverlay = { createSnowfall };\n})();\n`);
