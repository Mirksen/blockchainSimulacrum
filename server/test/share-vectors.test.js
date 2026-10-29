import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sha256hex, leadingHexZeros, proofPrefix } from '../src/app.js';
import { isRound } from '../src/bitcoinTip.js';

const vectors = JSON.parse(readFileSync(new URL('../../shared/share-vectors.json', import.meta.url), 'utf8'));
const PREFIX_RE = /^proofofwork\.fyi\|([0-9a-f]{64})\|(\d+):([0-9a-f]{64})\|([A-Za-z0-9-]{3,20})\|$/;

test('shared share vectors file has at least 5 well-formed entries', () => {
  assert.ok(Array.isArray(vectors));
  assert.ok(vectors.length >= 5);
  for (const v of vectors) {
    assert.deepEqual(Object.keys(v).sort(), ['hash', 'nonce', 'prefix', 'zeros']);
    assert.match(v.prefix, PREFIX_RE);
    assert.ok(Number.isSafeInteger(v.nonce) && v.nonce >= 0);
    assert.match(v.hash, /^[0-9a-f]{64}$/);
  }
  assert.ok(vectors.some((v) => v.zeros >= 4), 'at least one vector was mined to four or more zeros');
});

test('every vector prefix is what proofPrefix builds from its genesis hash, round and name', () => {
  for (const v of vectors) {
    const [, genesisHash, height, hash, name] = v.prefix.match(PREFIX_RE);
    const round = { height: Number(height), hash };
    assert.ok(isRound(round), v.prefix);
    assert.equal(proofPrefix(genesisHash, round, name), v.prefix);
  }
});

test('server hashing matches the shared share vectors', () => {
  for (const v of vectors) {
    const hash = sha256hex(v.prefix + String(v.nonce));
    assert.equal(hash, v.hash, `${v.prefix}${v.nonce}`);
    assert.equal(createHash('sha256').update(`${v.prefix}${v.nonce}`).digest('hex'), v.hash);
    assert.equal(leadingHexZeros(hash), v.zeros);
  }
});
