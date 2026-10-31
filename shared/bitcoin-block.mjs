// The proofofwork.fyi genesis block in Bitcoin's own byte format, built like Satoshi's
// block 0: an 80-byte header (version, previous block hash, merkle root, time, bits, nonce)
// hashed with double SHA-256, and one coinbase transaction whose scriptSig pushes the bits,
// an extraNonce and the headline. With a single transaction the merkle root is its txid.
//
// Everything here works on hex strings; `sha256d` maps a hex string of bytes to the hex of
// their double SHA-256 in internal byte order, so Node (node:crypto) and the browser
// (crypto-js) share the same code. Hashes and txids are displayed byte-reversed, like
// every block explorer does.

const hexByte = n => n.toString(16).padStart(2, '0');

/** Little-endian hex of an unsigned integer of `bytes` bytes (BigInt-safe up to 8 bytes). */
export function le(value, bytes) {
  let v = BigInt(value);
  if (v < 0n || v >= 1n << BigInt(8 * bytes)) throw new Error(`${value} does not fit in ${bytes} bytes`);
  let out = '';
  for (let i = 0; i < bytes; i += 1) { out += hexByte(Number(v & 0xffn)); v >>= 8n; }
  return out;
}

/** Reverses the byte order of a hex string (internal order <-> display order). */
export const reverseHex = hex => hex.match(/../g).reverse().join('');

const utf8Hex = text => Array.from(new TextEncoder().encode(text), hexByte).join('');

function varint(n) {
  if (n < 0xfd) return hexByte(n);
  if (n <= 0xffff) return `fd${le(n, 2)}`;
  return `fe${le(n, 4)}`;
}

/** A script data push of the given hex bytes (direct push or OP_PUSHDATA1). */
function push(hex) {
  const length = hex.length / 2;
  if (length <= 75) return hexByte(length) + hex;
  if (length <= 255) return `4c${hexByte(length)}${hex}`;
  throw new Error('push too long');
}

const MAX_COINBASE_SCRIPT = 100;

/**
 * The coinbase transaction split around its extraNonce bytes: hex `prefix`, `suffix` and the
 * whole transaction for `extraNonce`. Fields: bits (number), extraNonce (number or BigInt),
 * extraNonceBytes, memo (text), value (satoshis), pubkey (hex, the output is pay-to-pubkey).
 */
export function coinbaseParts({ bits, extraNonce = 0, extraNonceBytes, memo, value, pubkey }) {
  const bitsPush = push(le(bits, 4));
  const memoPush = push(utf8Hex(memo));
  const extraLength = 1 + extraNonceBytes;
  const scriptLength = bitsPush.length / 2 + extraLength + memoPush.length / 2;
  if (scriptLength > MAX_COINBASE_SCRIPT) throw new Error(`coinbase scriptSig of ${scriptLength} bytes exceeds ${MAX_COINBASE_SCRIPT}`);
  const outputScript = `${push(pubkey)}ac`;  // <pubkey> OP_CHECKSIG
  const prefix = `${le(1, 4)}01${'00'.repeat(32)}ffffffff${varint(scriptLength)}${bitsPush}${hexByte(extraNonceBytes)}`;
  const suffix = `${memoPush}ffffffff01${le(value, 8)}${varint(outputScript.length / 2)}${outputScript}${le(0, 4)}`;
  return { prefix, suffix, hex: prefix + le(extraNonce, extraNonceBytes) + suffix };
}

/** The 80-byte header for display-order previous hash and merkle root. */
export function headerHex({ version, previousHash, merkleRoot, time, bits, nonce }) {
  return le(version, 4) + reverseHex(previousHash) + reverseHex(merkleRoot) + le(time, 4) + le(bits, 4) + le(nonce, 4);
}

/** Display-order hash of a hex byte string. */
export const displayHash = (hex, sha256d) => reverseHex(sha256d(hex));

/**
 * The genesis block of `genesis` (shared/genesis.json): its coinbase hex, txid, header hex
 * and hash, all derived from the stored fields so anyone can recompute them.
 */
export function buildBlock(genesis, sha256d) {
  const { header, coinbase } = genesis;
  const tx = coinbaseParts({ bits: header.bits, ...coinbase }).hex;
  const txid = displayHash(tx, sha256d);
  const headerBytes = headerHex({ ...header, previousHash: genesis.anchor.hash, merkleRoot: txid });
  return { coinbaseHex: tx, txid, merkleRoot: txid, headerHex: headerBytes, hash: displayHash(headerBytes, sha256d) };
}

/** Leading zero bits of a display-order hash. */
export function leadingZeroBits(hash) {
  let bits = 0;
  for (const c of hash) {
    const v = parseInt(c, 16);
    if (v === 0) { bits += 4; continue; }
    return bits + Math.clz32(v) - 28;
  }
  return bits;
}

/** The target a compact `bits` value encodes. */
export function targetOf(bits) {
  const exponent = bits >>> 24;
  const mantissa = BigInt(bits & 0x7fffff);
  return exponent <= 3 ? mantissa >> BigInt(8 * (3 - exponent)) : mantissa << BigInt(8 * (exponent - 3));
}

/** Leading hex zeros every hash meeting the `bits` target has (8 for difficulty 1). */
export function zerosOfTarget(bits) {
  return Math.floor((256 - targetOf(bits).toString(2).length) / 4);
}

/** Bitcoin difficulty of a hash: the difficulty-1 target divided by the hash value. */
export function hashDifficulty(hash) {
  const one = targetOf(0x1d00ffff) * 10000n;
  return Number(one / (BigInt(`0x${hash}`) + 1n)) / 10000;
}
