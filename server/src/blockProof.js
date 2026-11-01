import { createHash } from 'node:crypto';

// A leaderboard proof is a mined block in Bitcoin's byte format. Its coinbase ends with an
// OP_RETURN output holding a commitment: the SHA-256 of the proof prefix, which names the
// chain (genesis hash), the round (a recent Bitcoin block) and the miner. The 80-byte header
// commits to the coinbase through the merkle root, so the block's hash can only count for
// that name in that round. Blocks live in each visitor's own chain, so the server checks
// this work and never the block's place in a chain.

export const HEADER_HEX_LENGTH = 160;
export const MAX_COINBASE_HEX_LENGTH = 512;
export const MAX_BRANCH_LENGTH = 12;

const COINBASE_START = `0100000001${'00'.repeat(32)}ffffffff`;
const MERKLE_ROOT_AT = 72; // Hex offset: 4 version bytes, 32 previous-hash bytes.
const MERKLE_ROOT_LENGTH = 64;

const sha256d = (hex) => {
  const once = createHash('sha256').update(Buffer.from(hex, 'hex')).digest();
  return createHash('sha256').update(once).digest('hex');
};
const reverseHex = (hex) => hex.match(/../g).reverse().join('');

// What the coinbase must end with: a zero-value OP_RETURN <commitment> output, then the locktime.
export const coinbaseTail = (commitment) => `${'00'.repeat(8)}226a20${commitment}${'00'.repeat(4)}`;

// Display-order hash of the 80-byte header, as every block explorer shows it.
export const blockHash = (header) => reverseHex(sha256d(header));

function merkleRootOf(coinbase, branch) {
  return branch.reduce((node, sibling) => sha256d(node + sibling), sha256d(coinbase));
}

// Whether the header commits to a coinbase that carries `commitment`. Transaction 0 is
// always the left child, so the branch folds from one side.
export function commitsTo({ header, coinbase, branch }, commitment) {
  return coinbase.startsWith(COINBASE_START) && coinbase.endsWith(coinbaseTail(commitment)) &&
    header.slice(MERKLE_ROOT_AT, MERKLE_ROOT_AT + MERKLE_ROOT_LENGTH) === merkleRootOf(coinbase, branch);
}
