import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(process.argv[2] || fileURLToPath(new URL('../dist', import.meta.url)));
const manifest = JSON.parse(await readFile(`${dist}/.vite/manifest.json`, 'utf8'));
const entries = Object.keys(manifest).filter(key => manifest[key].isEntry);
assert.ok(entries.length, 'Build manifest has no entry');
const files = new Set();
const visited = new Set();
function collect(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  assert.ok(chunk, `Missing static dependency ${key}`);
  files.add(chunk.file);
  for (const css of chunk.css || []) files.add(css);
  for (const dependency of chunk.imports || []) collect(dependency);
}
entries.forEach(collect);
const sizes = { js: 0, css: 0 };
for (const file of files) {
  const kind = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : null;
  if (kind) sizes[kind] += gzipSync(await readFile(resolve(dist, file))).length;
}
// e009022 eagerly shipped 265,995 bytes JS and 26,504 bytes CSS (gzip).
// Keep room above the split build while preventing a return to that payload.
assert.ok(sizes.js <= 255 * 1024, `Initial JavaScript ${sizes.js} exceeds 255 KiB gzip`);
assert.ok(sizes.css <= 25 * 1024, `Initial CSS ${sizes.css} exceeds 25 KiB gzip`);
console.log(JSON.stringify({ initialGzipBytes: sizes, files: [...files] }));
