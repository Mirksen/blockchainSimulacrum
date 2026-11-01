import { describe, expect, it } from 'vitest';
import CryptoJS from 'crypto-js/core';
import SHA256 from 'crypto-js/sha256';
import { Blockchain, createGenesisBlock, GENESIS } from '../lib/blockchain';
import { buildBlock, displayHash, leadingZeroBits, targetOf, zerosOfTarget } from '../../../shared/bitcoin-block.mjs';
import { formatDifficulty, hashDifficulty, leadingZeros, poolCandidate, proofPrefix, signatureOf, verifyRow } from '../lib/poolProof';

const ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };
const sha256d = hex => SHA256(SHA256(CryptoJS.enc.Hex.parse(hex))).toString();

describe('Bitcoin block format', () => {
  it("rebuilds Satoshi's block 0 byte for byte", () => {
    const block = buildBlock({
      anchor: { hash: '0'.repeat(64) },
      header: { version: 1, time: 1231006505, bits: 0x1d00ffff, nonce: 2083236893 },
      coinbase: {
        extraNonce: 4, extraNonceBytes: 1, value: 5000000000,
        memo: 'The Times 03/Jan/2009 Chancellor on brink of second bailout for banks',
        pubkey: '04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f',
      },
    }, sha256d);
    expect(block.txid).toBe('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
    expect(block.hash).toBe('000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
    expect(leadingZeroBits(block.hash)).toBe(43);
  });

  it('stores the genesis bytes it hashes', () => {
    const block = buildBlock(GENESIS, sha256d);
    expect(block).toMatchObject({ hash: GENESIS.hash, txid: GENESIS.txid, coinbaseHex: GENESIS.coinbaseHex, headerHex: GENESIS.headerHex });
    expect(BigInt(`0x${GENESIS.hash}`) <= targetOf(GENESIS.header.bits)).toBe(true);
  });
});

describe('genesis block', () => {
  it('rebuilds the stored genesis hash from shared/genesis.json', () => {
    const block = createGenesisBlock();
    expect(block.hash).toBe(GENESIS.hash);
    expect(block.isValid()).toBe(true);
    expect(block.previousHash).toBe(GENESIS.anchor.hash);
    expect(block.txRoot).toBe(GENESIS.txid);
    expect(block.difficulty).toBe(zerosOfTarget(GENESIS.header.bits));
    expect(leadingZeros(block.hash)).toBeGreaterThanOrEqual(block.difficulty);
  });

  it('carries one unspendable coinbase with the memo', () => {
    const [coinbase] = createGenesisBlock().transactions;
    expect(coinbase).toMatchObject({ isCoinbase: true, memo: GENESIS.coinbase.memo });
    expect(coinbase.outputs[0].value).toBe(GENESIS.coinbase.value);
    expect(new Blockchain('synthetic', 1).ledger().confirmed.size).toBe(0);
  });

  it('changes its txid and hash when the coinbase amount is edited', () => {
    const block = createGenesisBlock();
    block.transactions[0].outputs[0].value = 5000000000;
    expect(block.transactions[0].createHash()).not.toBe(GENESIS.txid);
    expect(block.isValid()).toBe(false);
  });

  it('starts every simulated chain, which stays valid', () => {
    const chain = new Blockchain('synthetic', 1);
    expect(chain.blockArray[0].hash).toBe(GENESIS.hash);
    expect(chain.isChainValid()).toBe(true);
  });
});

describe('pool proof', () => {
  it('names the chain, the round and the miner in its prefix', () => {
    expect(proofPrefix(GENESIS.hash, ROUND, 'synthetic-miner'))
      .toBe(`proofofwork.fyi|${GENESIS.hash}|${ROUND.height}:${ROUND.hash}|synthetic-miner|`);
  });

  it('verifies a row from its public fields and catches a changed name', () => {
    const name = 'synthetic-miner';
    const signature = signatureOf({ name, round: ROUND, prefix: proofPrefix(GENESIS.hash, ROUND, name) });
    const candidate = poolCandidate(signature, { time: 1_800_000_000, extraNonce: 0, zeros: 1 });
    const header = `${candidate.header}${'00'.repeat(4)}`;
    const row = { name, round: ROUND, header, coinbase: candidate.coinbase, branch: [], bestHash: displayHash(header, sha256d) };
    expect(verifyRow(row)).toMatchObject({ header, hash: row.bestHash, signed: true, matches: true });
    expect(verifyRow({ ...row, name: 'other-miner' }).matches).toBe(false);
    expect(verifyRow({ ...row, bestHash: '0'.repeat(64) }).matches).toBe(false);
    expect(verifyRow({ ...row, branch: ['ab'.repeat(32)] }).signed).toBe(false);
  });

  it('scores difficulty relative to one zero, finer than counting zeros', () => {
    expect(hashDifficulty(`0${'f'.repeat(63)}`)).toBe(1);
    expect(hashDifficulty(`00${'f'.repeat(62)}`)).toBe(16);
    // Equal zeros, smaller hash, higher difficulty.
    expect(hashDifficulty(`0001${'0'.repeat(60)}`)).toBeGreaterThan(hashDifficulty(`0009${'0'.repeat(60)}`));
  });

  it('abbreviates large difficulties', () => {
    expect(formatDifficulty(1.5)).toBe('1.5');
    expect(formatDifficulty(4096)).toBe('4,096');
    expect(formatDifficulty(2.5e9)).toBe('2.5 B');
    expect(formatDifficulty(Number.NaN)).toBe('—');
  });
});
