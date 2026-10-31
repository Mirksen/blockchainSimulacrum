import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ec as EC } from 'elliptic';
import { GENESIS } from '../lib/blockchain';
import { addressOf, hash160 } from '../lib/tx/encoding';
import { classifyScript, evaluateScript, p2pkhScript, p2pkScript, scriptAsm, scriptNumberPush } from '../lib/tx/script';
import { createCoinbase, Transaction } from '../lib/tx/transaction';
import vectors from './fixtures/bitcoin-transactions.json';

const ec = new EC('secp256k1');
const SATOSHI = '04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f';
const HAL = GENESIS.coinbase.pubkey;

describe('real mainnet transactions', () => {
  it.each(['block170', 'p2pkhUncompressed', 'p2pkhCompressed'])('%s round-trips byte for byte and hashes to its txid', name => {
    const { hex, txid } = vectors[name];
    const tx = Transaction.parse(hex);
    expect(tx.serialize()).toBe(hex);
    expect(tx.createHash()).toBe(txid);
  });

  it('verifies the first transfer ever: block 170 spending the P2PK coinbase of block 9', () => {
    const tx = Transaction.parse(vectors.block170.hex);
    const parent = Transaction.parse(vectors.block170.parent);
    expect(tx.inputs[0].txid).toBe(parent.createHash());
    expect(parent.outputs[0].scriptPubKey).toBe(p2pkScript(classifyScript(parent.outputs[0].scriptPubKey).pubkey));
    expect(tx.verifyInput(0, parent.outputs[0].scriptPubKey)).toBe(true);
  });

  it.each(['p2pkhUncompressed', 'p2pkhCompressed'])('verifies %s through OP_DUP OP_HASH160 OP_EQUALVERIFY OP_CHECKSIG', name => {
    const { hex, prevScript } = vectors[name];
    expect(Transaction.parse(hex).verifyInput(0, prevScript)).toBe(true);
  });

  it.each(['p2pkhUncompressed', 'p2pkhCompressed'])('fails %s once one output value changes', name => {
    const { hex, prevScript } = vectors[name];
    const tx = Transaction.parse(hex);
    tx.outputs[0].value += 1;
    expect(tx.verifyInput(0, prevScript)).toBe(false);
  });

  it('fails a P2PKH spend whose key hashes to a different address', () => {
    const { hex } = vectors.p2pkhCompressed;
    expect(Transaction.parse(hex).verifyInput(0, vectors.p2pkhUncompressed.prevScript)).toBe(false);
  });

  it('computes the coinbase rules of a real block: BIP34 height first, value in satoshis', () => {
    const coinbase = Transaction.parse(vectors.coinbase400000.hex);
    expect(coinbase.isCoinbase).toBe(true);
    expect(coinbase.serialize()).toBe(vectors.coinbase400000.hex);
    expect(coinbase.inputs[0].scriptSig.startsWith(scriptNumberPush(vectors.coinbase400000.height))).toBe(true);
  });
});

describe('Bitcoin Core signature hash vectors', () => {
  it('has SIGHASH_ALL cases to check', () => expect(vectors.sighash.length).toBe(8));
  it.each(vectors.sighash.map((row, i) => [i, row]))('vector %i', (_, { tx, script, index, hashType, digest }) => {
    const parsed = Transaction.parse(tx);
    expect(parsed.sigHash(index, script, hashType).match(/../g).reverse().join('')).toBe(digest);
  });
});

describe('keys and addresses', () => {
  it('derives the addresses of Satoshi and Hal Finney from their keys', () => {
    expect(addressOf(hash160(SATOSHI))).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(addressOf(hash160(HAL))).toBe('1Q2TWHE3GMdB6BZKafqwxXtWAWgFt5Jvm3');
  });

  it('signs with RFC 6979 and low S (published secp256k1 vector, key 1, "Satoshi Nakamoto")', () => {
    const key = ec.keyFromPrivate('01'.padStart(64, '0'));
    const message = Array.from(new TextEncoder().encode('Satoshi Nakamoto'), b => b.toString(16).padStart(2, '0')).join('');
    const hash = createHash('sha256').update(Buffer.from(message, 'hex')).digest('hex');
    const signature = key.sign(hash, { canonical: true });
    expect(signature.r.toString(16, 64)).toBe('934b1ea10a4b3c1757e2b0c017d0b6143ce3c9a7e6a4a49860d7a6ab210ee3d8');
    expect(signature.s.toString(16, 64)).toBe('2442ce9d2b916064108014783e923ec36b49743e2ffa1c4496f01a512aafd9e5');
  });
});

describe('scripts', () => {
  it('displays P2PKH like a block explorer', () => {
    const script = p2pkhScript('ab'.repeat(20));
    expect(scriptAsm(script)).toBe(`OP_DUP OP_HASH160 ${'ab'.repeat(20)} OP_EQUALVERIFY OP_CHECKSIG`);
    expect(classifyScript(script)).toEqual({ type: 'p2pkh', pubKeyHash: 'ab'.repeat(20) });
  });

  it.each([[1, '51'], [16, '60'], [17, '0111'], [127, '017f'], [128, '028000'], [255, '02ff00'], [256, '020001'], [400000, '03801a06']])(
    'pushes height %i as %s', (height, hex) => expect(scriptNumberPush(height)).toBe(hex));

  it('fails an unknown opcode, an empty stack, a truncated push and OP_RETURN', () => {
    const no = () => { throw new Error('no signature check expected'); };
    expect(evaluateScript('', 'ff', no)).toBe(false);
    expect(evaluateScript('', '76', no)).toBe(false);
    expect(evaluateScript('4c', '51', no)).toBe(false);
    expect(evaluateScript('51', '6a', no)).toBe(false);
  });
});

describe('createCoinbase', () => {
  const coinbase = extra => createCoinbase({ height: 5, value: 312500000, recipientScript: p2pkhScript('ab'.repeat(20)), ...extra });
  it('commits to the height, so equal rewards to one miner get different txids', () => {
    expect(coinbase().createHash()).not.toBe(createCoinbase({ height: 6, value: 312500000, recipientScript: p2pkhScript('ab'.repeat(20)) }).createHash());
  });
  it('commits to the extraNonce and reads back as a coinbase with its tag', () => {
    expect(coinbase({ extraNonce: 1 }).createHash()).not.toBe(coinbase().createHash());
    expect(coinbase()).toMatchObject({ isCoinbase: true, memo: 'Mining Reward' });
    expect(Transaction.parse(coinbase().serialize()).createHash()).toBe(coinbase().createHash());
  });
  it('keeps the scriptSig within the 2 to 100 bytes Bitcoin allows', () => {
    const size = coinbase({ height: 2 ** 30 }).inputs[0].scriptSig.length / 2;
    expect(size).toBeGreaterThanOrEqual(2);
    expect(size).toBeLessThanOrEqual(100);
  });
});

describe('the genesis coinbase', () => {
  it('parses into the same txid and pays Hal Finney with P2PK', () => {
    const tx = Transaction.parse(GENESIS.coinbaseHex);
    expect(tx.createHash()).toBe(GENESIS.txid);
    expect(tx.isCoinbase).toBe(true);
    expect(tx.memo).toBe(GENESIS.coinbase.memo);
    expect(tx.outputs[0]).toEqual({ value: GENESIS.coinbase.value, scriptPubKey: p2pkScript(GENESIS.coinbase.pubkey) });
  });
});
