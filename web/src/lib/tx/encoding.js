// Bitcoin's byte-level helpers on hex strings: hashes, Base58Check addresses and script numbers.
// Hex in, hex out, like shared/bitcoin-block.mjs.

import CryptoJS from 'crypto-js/core';
import RIPEMD160 from 'crypto-js/ripemd160';
import SHA256 from 'crypto-js/sha256';
import { sha256d } from '../blockHeader';

const bytes = hex => CryptoJS.enc.Hex.parse(hex);

/** RIPEMD-160 of SHA-256, the hash inside an address. */
export const hash160 = hex => RIPEMD160(SHA256(bytes(hex))).toString();

/** The text of hex bytes, or null when they are not valid UTF-8. */
export function hexUtf8(hex) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(hex.match(/../g) ?? [], byte => parseInt(byte, 16)));
  } catch {
    return null;
  }
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58Check of a version byte and payload, both hex. */
export function base58Check(version, payload) {
  const data = version + payload;
  const full = data + sha256d(data).slice(0, 8);
  let value = BigInt(`0x${full}`);
  let out = '';
  while (value > 0n) {
    out = BASE58[Number(value % 58n)] + out;
    value /= 58n;
  }
  const leadingZeros = /^(?:00)*/.exec(full)[0].length / 2;
  return '1'.repeat(leadingZeros) + out;
}

const MAINNET_P2PKH = '00';

/** The mainnet P2PKH address of a public key hash. */
export const addressOf = pubKeyHash => base58Check(MAINNET_P2PKH, pubKeyHash);
