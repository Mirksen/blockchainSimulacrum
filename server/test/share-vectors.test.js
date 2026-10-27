import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sha256hex, leadingHexZeros } from '../src/app.js';

const vectors = JSON.parse(readFileSync(new URL('../../shared/share-vectors.json', import.meta.url), 'utf8'));

test('shared share vectors file has at least 5 well-formed entries', () => {
  assert.ok(Array.isArray(vectors));
  assert.ok(vectors.length >= 5);
  for (const v of vectors) {
    assert.deepEqual(Object.keys(v).sort(), ['hash', 'nonce', 'prefix', 'zeros']);
    assert.match(v.prefix, /^proofofwork\.fyi\|[0-9a-f]{32}\|[A-Za-z0-9-]{3,20}\|$/);
    assert.ok(Number.isSafeInteger(v.nonce) && v.nonce >= 0);
    assert.match(v.hash, /^[0-9a-f]{64}$/);
  }
  assert.ok(vectors.some((v) => v.zeros >= 4), 'at least one vector meets the live target');
});

test('server hashing matches the shared share vectors', () => {
  for (const v of vectors) {
    const hash = sha256hex(v.prefix + String(v.nonce));
    assert.equal(hash, v.hash, `${v.prefix}${v.nonce}`);
    assert.equal(createHash('sha256').update(`${v.prefix}${v.nonce}`).digest('hex'), v.hash);
    assert.equal(leadingHexZeros(hash), v.zeros);
  }
});
