// Writes shared/block-proof-vectors.json: leaderboard proofs built with the browser's own block
// builders, which the server checks with its own hashing (server/test/block-proof-vectors.test.js)
// and the browser re-builds and checks (web/src/__tests__/poolProofShared.test.js).
//
//   npm ci --prefix web && node shared/make-pool-vectors.mjs
//
// Nothing here changes stored leaderboard data; the file only feeds tests.
//
// Two kinds of blocks: pool candidates (poolCandidate + search, as on the leaderboard page) and
// a block of the simulator's chain carrying the visitor's signature (prepareCandidate +
// search + proofOfBlock), with transactions under a merkle branch. Every input is fixed
// (synthetic names, rounds, BIP39 test phrases and header times), so the file is reproducible.
import { le } from './bitcoin-block.mjs';
import { proofPrefix } from './pool-proof.mjs';

// A synthetic genesis hash for the commitment; no real chain, round or person appears here.
export const VECTOR_GENESIS = 'a1'.repeat(32);
const ROUND_1 = Object.freeze({ height: 900001, hash: `00000000000000000000${'a'.repeat(44)}` });
const ROUND_2 = Object.freeze({ height: 900002, hash: '0000000000000000000123456789abcdef123456789abcdef123456789abcdef' });
const POOL_TIME = 1785000000;
const CHAIN_TIME = 1793430000;

// The first two BIP39 test vector phrases (Trezor), synthetic wallets for the chain block.
const MINER_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WALLET_PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

const POOL_VECTORS = Object.freeze([
  { name: 'sample-miner', round: ROUND_1, extraNonce: 3, zeros: 4 },
  { name: 'Bob-7', round: ROUND_2, extraNonce: 3, zeros: 2 },
]);
const CHAIN_VECTOR = Object.freeze({ name: 'chain-miner', round: ROUND_2, zeros: 3 });

const zerosOf = hash => /^0*/.exec(hash)[0].length;

// The browser's search from nonce 0, so the first proof is the same on every run.
async function solve(search, header, bits) {
  const result = await search({ entrants: [{ id: 'vector', header }], bits, batch: 4096 });
  if (result.status !== 'found') throw new Error(`no proof for ${header.slice(0, 16)}…`);
  return result;
}

/**
 * The vectors, built with the browser builders passed in: { poolCandidate, signatureOf,
 * proofOfBlock } (web/src/lib/poolProof.js), { Blockchain, Participant } (blockchain.js)
 * and { search } (powSearch.js).
 */
export async function makePoolVectors({ poolCandidate, signatureOf, proofOfBlock, Blockchain, Participant, search }) {
  const signature = ({ name, round }) => signatureOf({ name, round, prefix: proofPrefix(VECTOR_GENESIS, round, name) });
  const vectors = [];

  for (const vector of POOL_VECTORS) {
    const candidate = poolCandidate(signature(vector), { time: POOL_TIME, extraNonce: vector.extraNonce, zeros: vector.zeros });
    const { nonce, hash } = await solve(search, candidate.header, candidate.bits);
    vectors.push({ builder: 'poolCandidate', genesisHash: VECTOR_GENESIS, name: vector.name, round: vector.round,
      header: candidate.header + le(nonce, 4), coinbase: candidate.coinbase, branch: [], hash, zeros: zerosOf(hash) });
  }

  const chain = new Blockchain('vectors', CHAIN_VECTOR.zeros);
  const miner = Participant.fromSeedPhrase('Miner1', MINER_PHRASE, true);
  chain.participants.push(miner, Participant.fromSeedPhrase('Wallet2', WALLET_PHRASE));
  const mine = async (time, options = {}) => {
    const candidate = chain.prepareCandidate(miner, { time, ...options });
    const { nonce, hash } = await solve(search, candidate.header, candidate.bits);
    const outcome = chain.acceptBlock(candidate, nonce, hash);
    if (outcome.status !== 'accepted') throw new Error(`chain block ${candidate.height} ${outcome.status}`);
    return outcome.block;
  };
  await mine(CHAIN_TIME);
  chain.createTransaction('Miner1', 'Wallet2', 1, 0.0001);
  chain.createTransaction('Miner1', 'Wallet2', 0.5, 0.0001);
  const block = await mine(CHAIN_TIME + 600, { signature: signature(CHAIN_VECTOR) });
  if (block.transactions.length < 3) throw new Error('the chain block needs a merkle branch of two or more');
  vectors.push({ builder: 'proofOfBlock', genesisHash: VECTOR_GENESIS, name: CHAIN_VECTOR.name, round: CHAIN_VECTOR.round,
    ...proofOfBlock(block), hash: block.hash, zeros: zerosOf(block.hash) });
  return vectors;
}

export const vectorsText = vectors => `${JSON.stringify(vectors, null, 2)}\n`;

// The builders need the web app's module loading (extensionless imports, JSON, CommonJS
// dependencies), so the web test that checks the file against makePoolVectors() writes it:
// its file snapshot, updated in this one run.
const WEB_TEST = 'src/__tests__/poolProofShared.test.js';

async function main() {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const web = fileURLToPath(new URL('../web/', import.meta.url));
  const run = spawnSync('npx', ['vitest', 'run', WEB_TEST, '--update'], { cwd: web, stdio: 'inherit' });
  process.exitCode = run.status ?? 1;
}

if (globalThis.process?.argv?.[1] && import.meta.url === (await import('node:url')).pathToFileURL(globalThis.process.argv[1]).href) {
  await main();
}
