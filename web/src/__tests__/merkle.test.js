// @vitest-environment jsdom
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockDetailsModal } from '../components/BlockDetailsModal';
import { Block, candidateHash, createBlockchain, transactionRoot } from '../lib/blockchain';
import { createCoinbase } from '../lib/tx/transaction';
import { bitsOfZeros, headerHex, merkleRoot, meetsTarget as meetsBits } from '../../../shared/bitcoin-block.mjs';
import { sha256d } from '../lib/blockHeader';

// Independent reference: node:crypto, not the code under test.
const sha256 = bytes => createHash('sha256').update(bytes).digest();
const nodeSha256d = hex => sha256(sha256(Buffer.from(hex, 'hex')));
const ZERO_ROOT = '0'.repeat(64);

// Real mainnet blocks: an even and an odd transaction count, from mempool.space.
const BLOCK_100000 = {
  hash: '000000000003ba27aa200b1cecaad478d2b00432346c3f1f3986da1afd33e506',
  version: 1, previousHash: '000000000002d01c1fccc21636b607dfd930d31d01c3a62104612a1719011250',
  merkleRoot: 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766',
  time: 1293623863, bits: 453281356, nonce: 274148111,
  txids: ['8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87', 'fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4',
    '6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4', 'e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d']
};
const BLOCK_100002 = {
  hash: '0000000000013b8ab2cd513b0261a14096412195a72a0c4827d229dcc7e0f7af',
  version: 1, previousHash: '00000000000080b66c911bd5ba14a74260057311eaeb1982802f7010f1a9f090',
  merkleRoot: '2fda58e5959b0ee53c5253da9b9f3c0c739422ae04946966991cf55895287552',
  time: 1293625051, bits: 453281356, nonce: 2478813466,
  txids: ['ef1d870d24c85b89d92ad50f4631026f585d6a34e972eaf427475e5d60acf3a3', 'f9fc751cb7dc372406a9f8d738d5e6f8f63bab71986a39cf36ee70ee17036d07',
    'db60fb93d736894ed0b86cb92548920a3fe8310dd19b0da7ad97e48725e1e12e', '220ebc64e21abece964927322cba69180ed853bb187fbc6923bac7d010b9d87a',
    '71b3dbaca67e9f9189dad3617138c19725ab541ef0b49c05a94913e9f28e3f4e', 'fe305e1ed08212d76161d853222048eea1f34af42ea0e197896a269fbf8dc2e0',
    '21d2eb195736af2a40d42107e6abd59c97eb6cffd4a5a7a7709e86590ae61987', 'dd1fd2a6fc16404faf339881a90adbde7f4f728691ac62e8f168809cdfae1053',
    '74d681e0e03bafa802c8aa084379aa98d9fcd632ddc2ed9782b586ec87451f20']
};

const T0 = Date.parse('2026-01-02T12:00:00Z') / 1000;
const script = '76a914' + 'ab'.repeat(20) + '88ac';
const synthetic = [1, 2, 3].map(height => createCoinbase({ height, value: 312500000, recipientScript: script }));

const emptyChain = () => createBlockchain({
  participants: ['Miner One', 'Wallet Two', 'Wallet Three'], miners: ['Miner One'], miningDifficulty: 1
});
function setup() {
  const chain = emptyChain();
  mineNext(chain);
  return chain;
}
function mineNext(chain, time = T0 + chain.blockArray.length) {
  const candidate = chain.prepareCandidate(chain.getActiveMiner(), { time });
  let nonce = 0;
  while (!meetsBits(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  const outcome = chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce));
  expect(outcome.status).toBe('accepted');
  return { candidate, nonce, block: outcome.block };
}
// One mined block holding two signed transfers plus the coinbase (three transactions).
function chainWithThreeTransactionBlock() {
  const chain = setup();
  chain.createTransaction('Miner One', 'Wallet Two', 0.5, 0.01, 'synthetic transfer one');
  chain.createTransaction('Wallet Two', 'Wallet Three', 0.25, 0, 'synthetic transfer two');
  const mined = mineNext(chain);
  expect(mined.block.transactions).toHaveLength(3);
  return { chain, ...mined };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0 * 1000);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('transactionRoot', () => {
  it.each([['even', BLOCK_100000], ['odd', BLOCK_100002]])('reproduces a real Bitcoin block with an %s transaction count', (_, block) => {
    expect(merkleRoot(block.txids, sha256d)).toBe(block.merkleRoot);
    expect(transactionRoot(block.txids.map(txid => ({ createHash: () => txid })))).toBe(block.merkleRoot);
    const hex = headerHex(block);
    expect(Buffer.from(nodeSha256d(hex)).reverse().toString('hex')).toBe(block.hash);
    expect(meetsBits(block.hash, block.bits)).toBe(true);
  });

  it('has an all-zero root for no transactions and the txid for one', () => {
    expect(transactionRoot([])).toBe(ZERO_ROOT);
    expect(merkleRoot([BLOCK_100000.txids[0]], sha256d)).toBe(BLOCK_100000.txids[0]);
  });

  it('uses each transaction hash as its leaf', () => {
    const [tx] = synthetic;
    expect(transactionRoot([tx])).toBe(tx.createHash());
  });
});

describe('block header with a transaction root', () => {
  it('keeps a fresh chain with its genesis block valid', () => {
    const chain = emptyChain();
    const [coinbase] = chain.blockArray[0].transactions;
    expect(chain.blockArray[0].txRoot).toBe(coinbase.createHash());
    expect(chain.isChainValid()).toBe(true);
  });

  it('hashes the 80-byte header with double SHA-256, matching the candidate hash', () => {
    const { chain, candidate, nonce, block } = chainWithThreeTransactionBlock();
    const root = transactionRoot(block.transactions);
    expect(block.txRoot).toBe(root);
    expect(candidate.txRoot).toBe(root);
    expect(block.difficulty).toBe(1);
    const hex = headerHex(block.header());
    expect(hex).toHaveLength(160);
    expect(hex.slice(-8)).toBe(Buffer.from(Uint32Array.of(nonce).buffer).toString('hex'));
    expect(Buffer.from(nodeSha256d(hex)).reverse().toString('hex')).toBe(block.hash);
    expect(candidateHash(candidate, nonce)).toBe(block.createHash());
    // An untouched mined block and chain stay valid.
    expect(block.isValid()).toBe(true);
    expect(chain.isChainValid()).toBe(true);
  });

  it('detects tampering with the first transaction amount through the recomputed root', () => {
    const { chain, block } = chainWithThreeTransactionBlock();
    const rootBefore = transactionRoot(block.transactions);
    expect(chain.tamperTransaction(2, 0, 1.75)).toBe(true);
    expect(transactionRoot(block.transactions)).not.toBe(rootBefore);
    expect(block.txRoot).toBe(rootBefore);
    expect(block.isValid()).toBe(false);
    expect(chain.isChainValid()).toBe(false);
  });

  it('commits to the bits in the header', () => {
    const { block } = chainWithThreeTransactionBlock();
    block.bits = bitsOfZeros(2);
    expect(block.isValid()).toBe(false);
  });

  it('keeps the candidate header at 76 bytes whatever the transaction count', () => {
    const lengths = [0, 1, 2, 4].map(transfers => {
      const chain = setup();
      for (let i = 0; i < transfers; i++) chain.createTransaction('Miner One', 'Wallet Two', 0.1, 0, `synthetic ${i}`);
      const candidate = chain.prepareCandidate(chain.getActiveMiner(), { time: T0 });
      expect(candidate.transactions).toHaveLength(transfers + 1);
      return candidate.header.length;
    });
    expect(new Set(lengths)).toEqual(new Set([152]));
  });

  it('builds a standalone block with the stored root and the difficulty of its bits', () => {
    const transactions = synthetic;
    const block = new Block(T0, transactions, 'f'.repeat(64), bitsOfZeros(3));
    expect(block.difficulty).toBe(3);
    expect(block.txRoot).toBe(transactionRoot(transactions));
  });
});

describe('block details transaction root row', () => {
  const renderDetails = chain => render(createElement(BlockDetailsModal, {
    block: chain.blockArray[2], blockIndex: 2, blocks: chain.blockArray, participants: chain.participants,
    describeTx: chain.describer(), onClose: () => {}
  }));

  it('shows the stored root and labels a recomputed root in text after tampering', () => {
    const { chain, block } = chainWithThreeTransactionBlock();
    const stored = block.txRoot;
    const first = renderDetails(chain);
    const dialog = within(screen.getByRole('dialog', { name: 'Block details' }));
    expect(dialog.getAllByText(/^Merkle root/).length).toBeGreaterThan(0);
    expect(dialog.getAllByText(stored).length).toBeGreaterThan(0);
    expect(dialog.queryByText(/Changed after mining/)).toBeNull();
    first.unmount();

    chain.tamperTransaction(2, 0, 1.75);
    const recomputed = transactionRoot(block.transactions);
    expect(recomputed).not.toBe(stored);
    renderDetails(chain);
    const tampered = within(screen.getByRole('dialog', { name: 'Block details' }));
    expect(tampered.getAllByText(stored).length).toBeGreaterThan(0);
    expect(tampered.getByText('Changed after mining:')).toBeTruthy();
    expect(tampered.getByText(recomputed)).toBeTruthy();
  });
});
