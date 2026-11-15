import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commitmentOf, commitsTo } from '../../shared/pool-proof.mjs';
import { leadingHexZeros, sha256hex } from '../src/app.js';
import { blockHash, sha256d } from '../src/blockProof.js';
import { isRound } from '../src/bitcoinTip.js';

// Built with the browser's own code by shared/make-pool-vectors.mjs: pool candidates
// (poolCandidate + search) and a block of the simulator's chain (proofOfBlock).
const vectors = JSON.parse(readFileSync(new URL('../../shared/block-proof-vectors.json', import.meta.url), 'utf8'));
const commitment = (v, name = v.name) => commitmentOf(sha256hex, v.genesisHash, v.round, name);

test('the shared vectors hold well-formed blocks from both browser builders, one with a merkle branch', () => {
  assert.ok(vectors.length >= 3);
  for (const v of vectors) {
    assert.ok(isRound(v.round));
    assert.match(v.header, /^[0-9a-f]{160}$/);
  }
  assert.ok(vectors.filter((v) => v.builder === 'poolCandidate').length >= 2, 'pool candidates');
  assert.ok(vectors.some((v) => v.builder === 'proofOfBlock' && v.branch.length >= 2), 'a chain block under a merkle branch');
  assert.ok(vectors.some((v) => v.zeros >= 4), 'at least one vector was mined to four or more zeros');
});

test('the server computes the hash and accepts the signature of every vector', () => {
  for (const v of vectors) {
    assert.equal(blockHash(v.header), v.hash);
    assert.equal(leadingHexZeros(v.hash), v.zeros);
    assert.equal(commitsTo(sha256d, v, commitment(v)), true, v.name);
  }
});

test('a vector proves nothing for another name, coinbase or branch', () => {
  for (const v of vectors) {
    assert.equal(commitsTo(sha256d, v, commitment(v, 'someone-else')), false);
    assert.equal(commitsTo(sha256d, { ...v, coinbase: v.coinbase.replace('ffffffff', 'fffffffe') }, commitment(v)), false);
    assert.equal(commitsTo(sha256d, { ...v, branch: [...v.branch, 'ab'.repeat(32)] }, commitment(v)), false);
  }
});
