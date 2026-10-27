// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockDetailsModal } from '../components/BlockDetailsModal';
import { Block, Transaction, candidateHash, createBlockchain, transactionRoot } from '../lib/blockchain';

// Independent reference: node:crypto, not the code under test.
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const leaf = tx => sha(`${tx.sender}${tx.recipient}${tx.amount}${tx.transactionFee}${tx.referenceNumber}`);
const pair = (left, right) => sha(left + right);
const ZERO_ROOT = '0'.repeat(64);

const T0 = Date.parse('2026-01-02T12:00:00Z');
const synthetic = [
  { sender: 'wallet-a', recipient: 'wallet-b', amount: 1.5, transactionFee: 0.01, referenceNumber: 'synthetic one' },
  { sender: 'wallet-b', recipient: 'wallet-c', amount: 0.25, transactionFee: 0, referenceNumber: 'synthetic two' },
  { sender: null, recipient: 'wallet-c', amount: 3.125, transactionFee: 0, referenceNumber: 'Mining Reward' }
];
const asTransactions = list => list.map(t => new Transaction(t.sender, t.recipient, t.amount, t.transactionFee, t.referenceNumber));

const setup = () => createBlockchain({
  participants: ['Miner One', 'Wallet Two', 'Wallet Three'], miners: ['Miner One'], startingBalance: 2, miningDifficulty: 1
});
function mineNext(chain, timestamp = T0 + chain.blockArray.length) {
  const candidate = chain.prepareCandidate(chain.getActiveMiner(), { timestamp });
  let nonce = 0;
  while (!candidateHash(candidate, nonce).startsWith(candidate.target)) nonce++;
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
  vi.setSystemTime(T0);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('transactionRoot', () => {
  it('matches independently computed Merkle roots for 0, 1, 2 and 3 transactions', () => {
    const [a, b, c] = synthetic.map(leaf);
    const expected = [ZERO_ROOT, a, pair(a, b), pair(pair(a, b), pair(c, c))];
    for (let count = 0; count <= 3; count++) {
      expect(transactionRoot(asTransactions(synthetic.slice(0, count)))).toBe(expected[count]);
      // Plain objects without createHash hash the same fields.
      expect(transactionRoot(synthetic.slice(0, count))).toBe(expected[count]);
    }
  });

  it('uses each transaction hash as its leaf', () => {
    const [tx] = asTransactions(synthetic);
    expect(transactionRoot([tx])).toBe(tx.createHash());
  });
});

describe('block header with a transaction root', () => {
  it('keeps a fresh chain with its genesis block valid', () => {
    const chain = setup();
    expect(chain.blockArray[0].txRoot).toBe(ZERO_ROOT);
    expect(chain.isChainValid()).toBe(true);
  });

  it('hashes previous hash, root, timestamp, difficulty and nonce, matching the candidate hash', () => {
    const { chain, candidate, nonce, block } = chainWithThreeTransactionBlock();
    const root = transactionRoot(block.transactions);
    expect(block.txRoot).toBe(root);
    expect(candidate.txRoot).toBe(root);
    expect(block.difficulty).toBe(1);
    expect(block.hash).toBe(sha(block.previousHash + root + block.timestamp + block.difficulty + nonce));
    expect(candidateHash(candidate, nonce)).toBe(block.createHash());
    // An untouched mined block and chain stay valid.
    expect(block.isValid()).toBe(true);
    expect(chain.isChainValid()).toBe(true);
  });

  it('detects tampering with the first transaction amount through the recomputed root', () => {
    const { chain, block } = chainWithThreeTransactionBlock();
    const rootBefore = transactionRoot(block.transactions);
    expect(chain.tamperTransaction(1, 0, 1.75)).toBe(true);
    expect(transactionRoot(block.transactions)).not.toBe(rootBefore);
    expect(block.txRoot).toBe(rootBefore);
    expect(block.isValid()).toBe(false);
    expect(chain.isChainValid()).toBe(false);
  });

  it('commits to the difficulty in the header', () => {
    const { block } = chainWithThreeTransactionBlock();
    block.difficulty = 0;
    expect(block.isValid()).toBe(false);
  });

  it('keeps the candidate prefix length independent of the transaction count', () => {
    const lengths = [0, 1, 2, 4].map(transfers => {
      const chain = setup();
      for (let i = 0; i < transfers; i++) chain.createTransaction('Miner One', 'Wallet Two', 0.1, 0, `synthetic ${i}`);
      const candidate = chain.prepareCandidate(chain.getActiveMiner(), { timestamp: T0 });
      expect(candidate.transactions).toHaveLength(transfers + 1);
      return candidate.prefix.length;
    });
    expect(new Set(lengths).size).toBe(1);
  });

  it('builds a standalone block with the stored root and a zero default difficulty', () => {
    const transactions = asTransactions(synthetic);
    const block = new Block(T0, transactions, 'f'.repeat(64));
    expect(block.difficulty).toBe(0);
    expect(block.txRoot).toBe(transactionRoot(transactions));
  });
});

describe('block details transaction root row', () => {
  const renderDetails = chain => render(createElement(BlockDetailsModal, {
    block: chain.blockArray[1], blockIndex: 1, blocks: chain.blockArray, participants: chain.participants, onClose: () => {}
  }));

  it('shows the stored root and labels a recomputed root in text after tampering', () => {
    const { chain, block } = chainWithThreeTransactionBlock();
    const stored = block.txRoot;
    const first = renderDetails(chain);
    const dialog = within(screen.getByRole('dialog', { name: 'Block details' }));
    expect(dialog.getByText('Transaction Root')).toBeTruthy();
    expect(dialog.getByText(stored)).toBeTruthy();
    expect(dialog.queryByText(/Changed after mining/)).toBeNull();
    first.unmount();

    chain.tamperTransaction(1, 0, 1.75);
    const recomputed = transactionRoot(block.transactions);
    expect(recomputed).not.toBe(stored);
    renderDetails(chain);
    const tampered = within(screen.getByRole('dialog', { name: 'Block details' }));
    expect(tampered.getByText(stored)).toBeTruthy();
    expect(tampered.getByText('Changed after mining:')).toBeTruthy();
    expect(tampered.getByText(recomputed)).toBeTruthy();
  });
});
