// The pool's block proof rule, once for the browser and the server. A leaderboard proof is a
// mined block in Bitcoin's byte format. Its coinbase ends with an OP_RETURN output holding a
// commitment: the SHA-256 of the proof prefix, which names the chain (genesis hash), the round
// (a recent Bitcoin block) and the miner. The 80-byte header commits to the coinbase through
// the merkle root, so the block's hash can only count for that name in that round.
//
// Like shared/bitcoin-block.mjs, hashing is a parameter, so Node (node:crypto) and the browser
// (crypto-js) share the same code: `sha256` maps UTF-8 text to the hex of its SHA-256, and
// `sha256d` maps a hex string of bytes to the hex of their double SHA-256 in internal order.

/** A round counts while its Bitcoin block is one of the last ROUND_WINDOW blocks (about a day). */
export const ROUND_WINDOW = 144;

/** 3–20 letters, digits or hyphens. */
export const NAME_RE = /^[A-Za-z0-9-]{3,20}$/;

/** The `code` of a refused name in a pool server answer, next to its `error` text. */
export const POOL_ERRORS = Object.freeze({
  invalidName: 'invalid-name',
  nameUnavailable: 'name-unavailable',
  unknownName: 'unknown-name',
});

/** What a block's coinbase commits to: the chain (genesis hash), the round and whose work it is. */
export function proofPrefix(genesisHash, round, name) {
  return `proofofwork.fyi|${genesisHash}|${round.height}:${round.hash}|${name}|`;
}

/** The commitment a coinbase must carry for this chain, round and name. */
export const commitmentOf = (sha256, genesisHash, round, name) => sha256(proofPrefix(genesisHash, round, name));

/** How every coinbase starts: version 1, one input spending the null outpoint (index ffffffff). */
export const COINBASE_START = `0100000001${'00'.repeat(32)}ffffffff`;

/** What the coinbase must end with: a zero-value OP_RETURN <commitment> output, then the locktime. */
export const coinbaseTail = (commitment) => `${'00'.repeat(8)}226a20${commitment}${'00'.repeat(4)}`;

const MERKLE_ROOT_AT = 72; // Hex offset: 4 version bytes, 32 previous-hash bytes.
const MERKLE_ROOT_LENGTH = 64;

/**
 * Whether the header commits to a coinbase that carries `commitment`. Transaction 0 is
 * always the left child, so the branch folds from one side.
 */
export function commitsTo(sha256d, { header, coinbase, branch }, commitment) {
  if (!coinbase.startsWith(COINBASE_START) || !coinbase.endsWith(coinbaseTail(commitment))) return false;
  const root = branch.reduce((node, sibling) => sha256d(node + sibling), sha256d(coinbase));
  return header.slice(MERKLE_ROOT_AT, MERKLE_ROOT_AT + MERKLE_ROOT_LENGTH) === root;
}

/**
 * The proof score of a display-order block hash: its rank value relative to one leading hex
 * zero, 2^252 / (hash + 1), truncated to hundredths. A hash with z zeros scores at least
 * 16^(z - 1); among equal zeros the smaller hash scores higher. Not Bitcoin's difficulty
 * (`hashDifficulty` in shared/bitcoin-block.mjs).
 */
export function proofScore(hex) {
  return Number((2n ** 252n * 100n) / (BigInt(`0x${hex}`) + 1n)) / 100;
}
