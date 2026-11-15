import { beforeAll, describe, expect, it } from 'vitest';
import { commitsTo } from '../../../shared/pool-proof.mjs';
import { makePoolVectors, vectorsText } from '../../../shared/make-pool-vectors.mjs';
import { Blockchain, Participant } from '../lib/blockchain';
import { sha256d } from '../lib/blockHeader';
import { poolCandidate, proofCommitment, proofOfBlock, signatureOf, verifyRow } from '../lib/poolProof';
import { search } from '../lib/powSearch';

// The browser builders against the one block proof rule the server applies (shared/pool-proof.mjs).
// The server checks the same blocks with node:crypto (server/test/block-proof-vectors.test.js).
let vectors;
beforeAll(async () => {
  vectors = await makePoolVectors({ poolCandidate, signatureOf, proofOfBlock, Blockchain, Participant, search });
}, 60_000);

const commitmentFor = (v, name = v.name) => proofCommitment(v.genesisHash, v.round, name);
const built = builder => vectors.filter(v => v.builder === builder);

// The same coinbase and branch under a header whose merkle root commits to them.
function rehead(v, coinbase) {
  const root = v.branch.reduce((node, sibling) => sha256d(node + sibling), sha256d(coinbase));
  return { ...v, coinbase, header: v.header.slice(0, 72) + root + v.header.slice(136) };
}

describe('the shared block proof rule in the browser', () => {
  it('accepts a block built with poolCandidate and the search', () => {
    expect(built('poolCandidate').length).toBeGreaterThanOrEqual(2);
    for (const v of built('poolCandidate')) {
      expect(commitsTo(sha256d, v, commitmentFor(v)), v.name).toBe(true);
      expect(commitsTo(sha256d, v, commitmentFor(v, 'someone-else'))).toBe(false);
    }
  });

  it('accepts a block of the simulator chain from proofOfBlock, under a merkle branch', () => {
    const [v] = built('proofOfBlock');
    expect(v.branch.length).toBeGreaterThanOrEqual(2);
    expect(commitsTo(sha256d, v, commitmentFor(v))).toBe(true);
    expect(commitsTo(sha256d, { ...v, branch: v.branch.slice(1) }, commitmentFor(v))).toBe(false);
  });

  it('verifies a row only when its coinbase starts like a coinbase', () => {
    for (const v of vectors) {
      expect(verifyRow({ ...rehead(v, v.coinbase), bestHash: v.hash }, v.genesisHash).signed).toBe(true);
      // Version 2 instead of 1: same commitment at the end, merkle root rebuilt to match.
      const other = rehead(v, `02${v.coinbase.slice(2)}`);
      expect(verifyRow({ ...other, bestHash: v.hash }, v.genesisHash).signed, v.name).toBe(false);
      expect(commitsTo(sha256d, other, commitmentFor(v))).toBe(false);
    }
  });

  it('matches shared/block-proof-vectors.json, which node shared/make-pool-vectors.mjs writes', async () => {
    await expect(vectorsText(vectors)).toMatchFileSnapshot('../../../shared/block-proof-vectors.json');
  });
});
