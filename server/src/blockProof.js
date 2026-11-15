import { createHash } from 'node:crypto';

// A leaderboard proof is a mined block in Bitcoin's byte format; the rule it must meet is
// shared with the browser (shared/pool-proof.mjs: commitsTo). Blocks live in each visitor's
// own chain, so the server checks this work and never the block's place in a chain.

export const HEADER_HEX_LENGTH = 160;
export const MAX_COINBASE_HEX_LENGTH = 512;
export const MAX_BRANCH_LENGTH = 12;

/** Double SHA-256 of hex bytes, as hex in internal byte order (the `sha256d` of shared/). */
export const sha256d = (hex) => {
  const once = createHash('sha256').update(Buffer.from(hex, 'hex')).digest();
  return createHash('sha256').update(once).digest('hex');
};
const reverseHex = (hex) => hex.match(/../g).reverse().join('');

// Display-order hash of the 80-byte header, as every block explorer shows it.
export const blockHash = (header) => reverseHex(sha256d(header));
