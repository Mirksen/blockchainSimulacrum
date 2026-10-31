// Bitcoin script: the output scripts the simulator uses (P2PKH, P2PK, OP_RETURN), their display
// form, and a small interpreter for the opcodes those scripts need.

import { le, push } from '../../../../shared/bitcoin-block.mjs';
import { hash160, hexUtf8 } from './encoding';

export const OP = Object.freeze({
  OP_0: 0x00, OP_PUSHDATA1: 0x4c, OP_PUSHDATA2: 0x4d, OP_PUSHDATA4: 0x4e, OP_1: 0x51, OP_16: 0x60, OP_RETURN: 0x6a,
  OP_DUP: 0x76, OP_EQUAL: 0x87, OP_EQUALVERIFY: 0x88, OP_HASH160: 0xa9, OP_CODESEPARATOR: 0xab, OP_CHECKSIG: 0xac
});
const NAMES = new Map(Object.entries(OP).map(([name, code]) => [code, name]));
const byteHex = code => code.toString(16).padStart(2, '0');

/** Largest OP_RETURN payload Bitcoin Core relays by default before v30. */
export const MAX_MEMO_BYTES = 80;

/** <pubkey hash> locking script: OP_DUP OP_HASH160 <hash> OP_EQUALVERIFY OP_CHECKSIG. */
export const p2pkhScript = pubKeyHash => `76a9${push(pubKeyHash)}88ac`;

/** <pubkey> OP_CHECKSIG, the output of the earliest coinbases. */
export const p2pkScript = pubkey => `${push(pubkey)}ac`;

/** OP_RETURN <data>: an unspendable output that only carries data. */
export const opReturnScript = dataHex => `6a${push(dataHex)}`;

/** Unlocking script for P2PKH: <signature> <pubkey>. */
export const p2pkhScriptSig = (signature, pubkey) => push(signature) + push(pubkey);

/** Push of a block height the way Bitcoin Core encodes it (BIP34): OP_n up to 16, then a minimal script number. */
export function scriptNumberPush(n) {
  if (n === 0) return byteHex(OP.OP_0);
  if (n >= 1 && n <= 16) return byteHex(OP.OP_1 + n - 1);
  const size = Math.ceil(n.toString(2).length / 8);
  const body = le(n, size);
  // The top bit of a script number is its sign.
  return push(parseInt(body.slice(-2), 16) & 0x80 ? `${body}00` : body);
}

/** Decodes a script into operations, or null when a push runs past the end. */
export function parseScript(hex) {
  const ops = [];
  let at = 0;
  const take = count => {
    const end = at + count * 2;
    if (end > hex.length) return null;
    const part = hex.slice(at, end);
    at = end;
    return part;
  };
  const lengthIn = count => {
    const raw = take(count);
    return raw === null ? null : parseInt(raw.match(/../g).reverse().join(''), 16);
  };
  while (at < hex.length) {
    const code = parseInt(take(1), 16);
    let length = null;
    if (code >= 0x01 && code <= 0x4b) length = code;
    else if (code === OP.OP_PUSHDATA1) length = lengthIn(1);
    else if (code === OP.OP_PUSHDATA2) length = lengthIn(2);
    else if (code === OP.OP_PUSHDATA4) length = lengthIn(4);
    else { ops.push({ code }); continue; }
    const data = length === null ? null : take(length);
    if (data === null) return null;
    ops.push({ code, data });
  }
  return ops;
}

/** Display form of a script, one token per operation. */
export function scriptAsm(hex) {
  const ops = parseScript(hex);
  if (!ops) return `[invalid script] ${hex}`;
  return ops.map(({ code, data }) => {
    if (data !== undefined) return data;
    if (code >= OP.OP_1 && code <= OP.OP_16) return `OP_${code - OP.OP_1 + 1}`;
    return NAMES.get(code) ?? `OP_UNKNOWN_${byteHex(code)}`;
  }).join(' ');
}

/** What an output script is: { type: 'p2pkh', pubKeyHash } | { type: 'p2pk', pubkey } | { type: 'memo', data } | { type: 'unknown' }. */
export function classifyScript(hex) {
  const ops = parseScript(hex);
  if (ops?.length === 5 && ops[0].code === OP.OP_DUP && ops[1].code === OP.OP_HASH160 && ops[2].data?.length === 40 &&
    ops[3].code === OP.OP_EQUALVERIFY && ops[4].code === OP.OP_CHECKSIG) return { type: 'p2pkh', pubKeyHash: ops[2].data };
  if (ops?.length === 2 && ops[0].data && ops[1].code === OP.OP_CHECKSIG) return { type: 'p2pk', pubkey: ops[0].data };
  if (ops?.[0]?.code === OP.OP_RETURN) return { type: 'memo', data: ops[1]?.data ?? '' };
  return { type: 'unknown' };
}

/** The text an OP_RETURN script carries, or null. */
export function memoOf(hex) {
  const script = classifyScript(hex);
  return script.type === 'memo' ? hexUtf8(script.data) : null;
}

/** The hash an output script pays to, for its address, or null. */
export function pubKeyHashOf(hex) {
  const script = classifyScript(hex);
  if (script.type === 'p2pkh') return script.pubKeyHash;
  return script.type === 'p2pk' ? hash160(script.pubkey) : null;
}

const isTrue = item => item !== undefined && /[^0]/.test(item.slice(0, -2) + (item.slice(-2) === '80' ? '00' : item.slice(-2)));

function run(ops, stack, checkSignature) {
  for (const { code, data } of ops) {
    if (data !== undefined) stack.push(data);
    else if (code === OP.OP_0) stack.push('');
    else if (code >= OP.OP_1 && code <= OP.OP_16) stack.push(byteHex(code - OP.OP_1 + 1));
    else if (code === OP.OP_DUP) {
      if (!stack.length) return false;
      stack.push(stack.at(-1));
    } else if (code === OP.OP_HASH160) {
      if (!stack.length) return false;
      stack.push(hash160(stack.pop()));
    } else if (code === OP.OP_EQUAL || code === OP.OP_EQUALVERIFY) {
      if (stack.length < 2) return false;
      const equal = stack.pop() === stack.pop();
      if (code === OP.OP_EQUALVERIFY) {
        if (!equal) return false;
      } else stack.push(equal ? '01' : '');
    } else if (code === OP.OP_CHECKSIG) {
      if (stack.length < 2) return false;
      const pubkey = stack.pop();
      const signature = stack.pop();
      stack.push(checkSignature(signature, pubkey) ? '01' : '');
    } else return false; // OP_RETURN and everything this interpreter does not know fails the script.
  }
  return true;
}

/**
 * Runs scriptSig, then scriptPubKey on the resulting stack, as Bitcoin does. checkSignature(signature, pubkey)
 * decides OP_CHECKSIG; the script passes when the top of the stack is true.
 */
export function evaluateScript(scriptSig, scriptPubKey, checkSignature) {
  const unlock = parseScript(scriptSig);
  const lock = parseScript(scriptPubKey);
  if (!unlock || !lock) return false;
  const stack = [];
  return run(unlock, stack, checkSignature) && run(lock, stack, checkSignature) && isTrue(stack.at(-1));
}
