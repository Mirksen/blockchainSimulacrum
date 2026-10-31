// A Bitcoin transaction in its legacy serialisation: version, inputs, outputs, locktime. The txid is
// the double SHA-256 of these bytes, signatures use SIGHASH_ALL over the legacy preimage.

import { ec as EC } from 'elliptic';
import { displayHash, le, push, reverseHex, utf8Hex, varint } from '../../../../shared/bitcoin-block.mjs';
import { sha256d } from '../blockHeader';
import { hexUtf8 } from './encoding';
import { evaluateScript, memoOf, p2pkhScriptSig, parseScript, scriptNumberPush } from './script';

const ec = new EC('secp256k1');

export const SIGHASH_ALL = 1;
const ZERO_HASH = '0'.repeat(64);
const COINBASE_INDEX = 0xffffffff;
const FINAL_SEQUENCE = 0xffffffff;
const COINBASE_TAG = 'Mining Reward';

const serializeInput = ({ txid, vout, scriptSig, sequence }) =>
  reverseHex(txid) + le(vout, 4) + varint(scriptSig.length / 2) + scriptSig + le(sequence, 4);
const serializeOutput = ({ value, scriptPubKey }) => le(value, 8) + varint(scriptPubKey.length / 2) + scriptPubKey;

// SIGHASH_NONE, SIGHASH_SINGLE and ANYONECANPAY are not implemented, so they never verify.
const isSigHashAll = hashType => (hashType & 0x1f) !== 2 && (hashType & 0x1f) !== 3 && (hashType & 0x80) === 0;

class Reader {
  constructor(hex) { this.hex = hex; this.at = 0; }
  bytes(count) {
    const end = this.at + count * 2;
    if (end > this.hex.length) throw new Error('Transaction bytes end too early');
    const part = this.hex.slice(this.at, end);
    this.at = end;
    return part;
  }
  uint(count) { return Number(BigInt(`0x${reverseHex(this.bytes(count))}`)); }
  varint() {
    const first = this.uint(1);
    if (first < 0xfd) return first;
    return this.uint({ 0xfd: 2, 0xfe: 4, 0xff: 8 }[first]);
  }
}

export class Transaction {
  // inputs: [{ txid (display order), vout, scriptSig, sequence }], outputs: [{ value (satoshis), scriptPubKey }]
  constructor({ version = 1, inputs = [], outputs = [], locktime = 0 } = {}) {
    this.version = version;
    this.inputs = inputs.map(input => ({ scriptSig: '', sequence: FINAL_SEQUENCE, ...input }));
    this.outputs = outputs.map(output => ({ ...output }));
    this.locktime = locktime;
  }

  static parse(hex) {
    const reader = new Reader(hex);
    const version = reader.uint(4);
    const inputs = Array.from({ length: reader.varint() }, () => ({
      txid: reverseHex(reader.bytes(32)), vout: reader.uint(4), scriptSig: reader.bytes(reader.varint()), sequence: reader.uint(4)
    }));
    const outputs = Array.from({ length: reader.varint() }, () => ({ value: reader.uint(8), scriptPubKey: reader.bytes(reader.varint()) }));
    const locktime = reader.uint(4);
    if (reader.at !== hex.length) throw new Error('Transaction has trailing bytes');
    return new Transaction({ version, inputs, outputs, locktime });
  }

  get isCoinbase() {
    return this.inputs.length === 1 && this.inputs[0].txid === ZERO_HASH && this.inputs[0].vout === COINBASE_INDEX;
  }

  serialize(inputs = this.inputs) {
    return le(this.version, 4) + varint(inputs.length) + inputs.map(serializeInput).join('') +
      varint(this.outputs.length) + this.outputs.map(serializeOutput).join('') + le(this.locktime, 4);
  }

  /** The txid in display order; the only thing the block layer reads from a transaction. */
  createHash() {
    return displayHash(this.serialize(), sha256d);
  }

  /** Legacy signature hash of one input: every scriptSig blanked, this one set to the output script it spends. */
  sigHash(index, scriptCode, hashType = SIGHASH_ALL) {
    const inputs = this.inputs.map((input, i) => ({ ...input, scriptSig: i === index ? scriptCode : '' }));
    return sha256d(this.serialize(inputs) + le(hashType >>> 0, 4));
  }

  /** Signs input `index`, which spends a P2PKH output with `scriptCode`, and sets its scriptSig. */
  signInput(index, keyPair, scriptCode) {
    const digest = this.sigHash(index, scriptCode);
    const der = keyPair.sign(digest, { canonical: true }).toDER('hex');
    this.inputs[index].scriptSig = p2pkhScriptSig(der + le(SIGHASH_ALL, 1), keyPair.getPublic(true, 'hex'));
  }

  /** Runs input `index` against the output script it spends. */
  verifyInput(index, scriptPubKey) {
    const checkSignature = (signature, pubkey) => {
      if (signature.length < 2) return false;
      const hashType = parseInt(signature.slice(-2), 16);
      if (!isSigHashAll(hashType)) return false;
      try {
        return ec.keyFromPublic(pubkey, 'hex').verify(this.sigHash(index, scriptPubKey, hashType), signature.slice(0, -2));
      } catch {
        return false; // Malformed key or signature encoding.
      }
    };
    return evaluateScript(this.inputs[index].scriptSig, scriptPubKey, checkSignature);
  }

  /** Bytes of the serialisation. */
  get size() {
    return this.serialize().length / 2;
  }

  /** The memo text: the last push of a coinbase scriptSig, otherwise the first OP_RETURN output. */
  get memo() {
    if (this.isCoinbase) {
      const last = parseScript(this.inputs[0].scriptSig)?.at(-1);
      return last?.data ? hexUtf8(last.data) : null;
    }
    for (const { scriptPubKey } of this.outputs) {
      const memo = memoOf(scriptPubKey);
      if (memo !== null) return memo;
    }
    return null;
  }
}

/** The coinbase of the block at `height` (BIP34): scriptSig = <height> <extraNonce> <tag>, one output paying `value`. */
export function createCoinbase({ height, value, recipientScript, extraNonce = 0, tag = COINBASE_TAG }) {
  const scriptSig = scriptNumberPush(height) + push(le(extraNonce, 8)) + push(utf8Hex(tag));
  return new Transaction({
    inputs: [{ txid: ZERO_HASH, vout: COINBASE_INDEX, scriptSig }],
    outputs: [{ value, scriptPubKey: recipientScript }]
  });
}
