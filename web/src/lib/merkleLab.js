// Prove a payment: Bitcoin's Merkle proof (SPV). A light client that holds only a block's
// 80-byte header can check that one transaction is in the block with the transaction, its
// position and one sibling hash per tree level: log2(n) hashes instead of n transactions.
//
// Like the other labs the block is a toy: its transactions are short payment texts, and a
// text's txid is the double SHA-256 of its bytes. The tree is Bitcoin's (shared merkleRoot):
// leaves and parents in internal byte order, a parent is the double SHA-256 of its two
// children, an odd level repeats its last hash. Hashes are returned in display order.
import { bitsOfZeros, headerHex, meetsTarget, reverseHex, utf8Hex, displayHash } from '../../../shared/bitcoin-block.mjs';
import { BLOCK_VERSION, hashAtNonce, headerPrefix, sha256d, ZERO_HASH } from './blockHeader';

export const BLOCK_SIZES = [4, 16, 256, 4096];
// Up to this size the view lists every transaction; larger blocks show the chosen one only.
export const LISTED_LIMIT = 16;
export const MAX_SIZE = 4096;
export const MERKLE_BITS = bitsOfZeros(1); // One leading hex zero, like the other labs.
// The labs' fixed clock (Satoshi's block 0), so the header depends only on the transactions.
const LAB_TIME = 1231006505;
const HASH = /^[0-9a-f]{64}$/;

export const isHash = value => typeof value === 'string' && HASH.test(value);

export const txidOf = text => displayHash(utf8Hex(text), sha256d);

const PAYERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
/** The toy payment text of transaction `index` (synthetic demo wallets and shops). */
export function paymentText(index) {
  return `Payment ${index}: demo wallet ${PAYERS[index % PAYERS.length]} pays shop ${(index * 7) % 50 + 1} ${(index % 9) + 1} virtual coins.`;
}

const parentOf = (left, right) => sha256d(left + right);

/**
 * Every level of Bitcoin's merkle tree over display-order txids, leaves first, in display
 * order; the last level holds the root. An empty list has the all-zero root.
 */
export function merkleLevels(txids) {
  if (txids.length === 0) return [[ZERO_HASH]];
  let level = txids.map(reverseHex);
  const levels = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(parentOf(level[i], level[i + 1] ?? level[i]));
    level = next;
    levels.push(level);
  }
  return levels.map(hashes => hashes.map(reverseHex));
}

/**
 * The proof that transaction `index` is in the tree `levels`: its txid, one sibling per
 * level with the side the sibling sits on, and the honest node hash of every level (txid
 * first, root last). On an odd level the last node is its own sibling.
 */
export function proofFromLevels(levels, index) {
  const size = levels[0].length;
  if (!Number.isInteger(index) || index < 0 || index >= size) throw new RangeError(`Choose a transaction from 0 to ${size - 1}.`);
  const path = [];
  const nodes = [];
  let position = index;
  for (let level = 0; level < levels.length; level++) {
    const hashes = levels[level];
    nodes.push(hashes[position]);
    if (level === levels.length - 1) break;
    const left = position % 2 === 1;
    const sibling = left ? hashes[position - 1] : hashes[position + 1] ?? hashes[position];
    path.push({ level, side: left ? 'left' : 'right', hash: sibling });
    position = Math.floor(position / 2);
  }
  return { index, txid: nodes[0], root: nodes.at(-1), path, levels: nodes };
}

/** A merkle tree over display-order txids with its root and proofs. */
export function buildTree(txids) {
  const levels = merkleLevels(txids);
  return { txids, levels, root: levels.at(-1)[0], proofFor: index => proofFromLevels(levels, index) };
}

/**
 * What a light client does with a proof: start at the txid, hash it with each sibling on
 * its side, and compare the result with the header's merkle root. Returns every recomputed
 * level (txid first) so a view can show the path. `reference`, the honest node hashes of a
 * proof (`proofFor(index).levels`), names the first level whose hash differs from the
 * block's tree; without it a failed proof can only be located at the root. A malformed txid
 * or sibling stops the computation: that level and the ones above have no hash.
 */
export function verifyProof(txid, path, root, reference = null) {
  const steps = [];
  let node = isHash(txid) ? txid : null;
  let malformed = node ? null : { level: 0, what: 'txid' };
  steps.push({ level: 0, hash: node });
  for (const [position, { side, hash }] of path.entries()) {
    const sibling = typeof hash === 'string' ? hash.toLowerCase() : hash;
    if (node && !isHash(sibling)) malformed = { level: position, what: 'sibling' };
    if (node && isHash(sibling)) {
      node = reverseHex(side === 'left'
        ? parentOf(reverseHex(sibling), reverseHex(node))
        : parentOf(reverseHex(node), reverseHex(sibling)));
    } else node = null;
    steps.push({ level: position + 1, hash: node });
  }
  const computedRoot = node;
  const valid = computedRoot !== null && computedRoot === root;
  let failedAt = null;
  if (!valid) {
    const diverged = reference ? steps.findIndex(step => step.hash !== reference[step.level]) : -1;
    failedAt = diverged >= 0 ? diverged : path.length;
  }
  return { steps, computedRoot, valid, failedAt, malformed };
}

const blocks = new Map();
/**
 * The sample block of `size` toy payments: texts, txids, tree, root and an 80-byte header
 * that commits to the root, mined at the labs' one-hex-zero target from nonce 0. Cached:
 * the example is fixed and never changes.
 */
export function sampleBlock(size) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_SIZE) throw new RangeError(`Choose 1 to ${MAX_SIZE} transactions.`);
  if (blocks.has(size)) return blocks.get(size);
  const texts = Array.from({ length: size }, (_, index) => paymentText(index));
  const tree = buildTree(texts.map(txidOf));
  const fields = { version: BLOCK_VERSION, previousHash: ZERO_HASH, merkleRoot: tree.root, time: LAB_TIME, bits: MERKLE_BITS };
  const prefix = headerPrefix(fields);
  let nonce = 0;
  while (!meetsTarget(hashAtNonce(prefix, nonce), MERKLE_BITS)) nonce++;
  const block = { size, texts, ...tree, nonce, header: headerHex({ ...fields, nonce }), hash: hashAtNonce(prefix, nonce) };
  blocks.set(size, block);
  return block;
}
