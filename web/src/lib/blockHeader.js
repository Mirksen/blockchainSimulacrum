import CryptoJS from 'crypto-js/core.js';
import 'crypto-js/sha256.js';
import { displayHash, headerHex, le, utf8Hex } from '../../../shared/bitcoin-block.mjs';

export const BLOCK_VERSION = 1;
export const ZERO_HASH = '0'.repeat(64);

// Double SHA-256 over hex bytes, in internal byte order (shared/bitcoin-block.mjs).
export const sha256d = hex => CryptoJS.SHA256(CryptoJS.SHA256(CryptoJS.enc.Hex.parse(hex))).toString();

export const MAX_NONCE = 0xffffffff;

export const isNonce = value => Number.isInteger(value) && value >= 0 && value <= MAX_NONCE;

/** Hex of the first 76 header bytes: everything a nonce search keeps constant. */
export const headerPrefix = fields => headerHex({ ...fields, nonce: 0 }).slice(0, 152);

/** Display-order hash of `headerPrefix` output at a nonce. */
export const hashAtNonce = (prefix, nonce) => displayHash(prefix + le(nonce, 4), sha256d);

// The labs hash real 80-byte headers too. Their fixed clock starts at Satoshi's block 0, ten
// minutes per block, so lab results depend on nothing but what the learner types. The text
// stands in for a block's transactions: like a single transaction, its double SHA-256 is
// the merkle root.
const LAB_TIME = 1231006505;

export function labHeaderPrefix({ data, previousHash = ZERO_HASH, number = 0, bits }) {
  return headerPrefix({ version: BLOCK_VERSION, previousHash, merkleRoot: displayHash(utf8Hex(data), sha256d),
    time: LAB_TIME + number * 600, bits });
}
