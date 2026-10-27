import { describe, expect, it } from 'vitest';
import vectors from '../../../shared/share-vectors.json';
import { createHasher } from '../lib/powSearch';

// The leaderboard server re-hashes every share with node:crypto; the browser
// searches with crypto-js and a midstate. Both must agree on every vector.
describe('shared share vectors', () => {
  it.each(vectors.map(v => [v.nonce, v]))('nonce %s hashes identically in the browser', (_, v) => {
    const hash = createHasher(v.prefix)(v.nonce);
    expect(hash).toBe(v.hash);
    expect(hash.match(/^0*/)[0].length).toBe(v.zeros);
  });
});
