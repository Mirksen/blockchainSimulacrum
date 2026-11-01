import { describe, expect, it } from 'vitest';
import vectors from '../../../shared/block-proof-vectors.json';
import { leadingZeros, verifyRow } from '../lib/poolProof';

// The server re-checks every block with node:crypto; the browser builds and verifies them
// with crypto-js. Both must agree on every vector (server/test/block-proof-vectors.test.js).
describe('shared block proof vectors', () => {
  it.each(vectors.map(v => [v.name, v]))('%s verifies identically in the browser', (_, v) => {
    const check = verifyRow({ ...v, bestHash: v.hash }, v.genesisHash);
    expect(check).toMatchObject({ hash: v.hash, signed: true, matches: true });
    expect(leadingZeros(check.hash)).toBe(v.zeros);
    expect(verifyRow({ ...v, name: 'someone-else', bestHash: v.hash }, v.genesisHash).matches).toBe(false);
  });

  it('holds a block with transactions under a merkle branch', () => {
    expect(vectors.some(v => v.branch.length >= 2)).toBe(true);
  });
});
