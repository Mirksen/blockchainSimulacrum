// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureBlockProof } from '../lib/workbenchProof';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import { verifyProof } from '../lib/merkleLab';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { MerkleProof } from '../components/MerkleProof';
import { ChainLab } from '../components/ChainLab';

const fixture = vi.hoisted(() => ({ wallet: 0 }));
vi.mock('../lib/wallet', async importOriginal => ({ ...await importOriginal(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++fixture.wallet;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
const flip = hash => (hash[0] === '0' ? '1' : '0') + hash.slice(1);
const hashBytes = hex => createHash('sha256').update(createHash('sha256').update(Buffer.from(hex, 'hex')).digest()).digest().reverse().toString('hex');
const setup = () => createBlockchain({ participants: ['Miner One', 'Wallet Two', 'Wallet Three'], miners: ['Miner One'], miningDifficulty: 1 });
function mine(chain) {
  const candidate = chain.prepareCandidate(chain.getActiveMiner());
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  expect(chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)).status).toBe('accepted');
}
function funded() {
  const chain = setup();
  mine(chain);
  chain.createTransaction('Miner One', 'Wallet Two', 0.5, 0.00001, 'fixture transfer');
  chain.createTransaction('Miner One', 'Wallet Three', 0.5, 0.00001, 'fixture transfer two');
  mine(chain);
  return chain;
}
beforeEach(() => { fixture.wallet = 0; vi.spyOn(Date, 'now').mockReturnValue(1760000000000); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('workbench block proof capture', () => {
  it('uses the actual raw bytes and mined header, including an odd tree and every transaction', () => {
    const chain = funded();
    const block = chain.blockArray[2];
    const source = captureBlockProof(block, 2, chain.describer(), 2);
    expect(source.size).toBe(3);
    expect(source.initialIndex).toBe(2);
    expect(source.header).toHaveLength(160);
    expect(hashBytes(source.header)).toBe(block.hash);
    expect(source.root).toBe(block.txRoot);
    expect(source.headerHashValid).toBe(true);
    expect(source.workValid).toBe(true);
    source.transactions.forEach((tx, index) => {
      expect(tx.txid).toBe(hashBytes(tx.hex));
      const proof = source.proofFor(index);
      expect(verifyProof(tx.txid, proof.path, source.root).valid).toBe(true);
    });
    expect(source.proofFor(2).path[0].hash).toBe(source.txids[2]);
  });
  it('detaches from the session transactions and preserves the mined root on later tampering', () => {
    const chain = funded();
    const block = chain.blockArray[2];
    const before = captureBlockProof(block, 2, chain.describer(), 1);
    const original = JSON.stringify(before);
    chain.tamperTransaction(2, 1, 0.4);
    expect(JSON.stringify(before)).toBe(original);
    const after = captureBlockProof(block, 2, chain.describer(), 1);
    expect(after.txids[1]).not.toBe(before.txids[1]);
    expect(after.header).toBe(before.header);
    expect(after.root).toBe(before.root);
    expect(after.treeRoot).not.toBe(after.root);
    expect(verifyProof(after.txids[1], after.proofFor(1).path, after.root).valid).toBe(false);
  });
  it('supports a single coinbase with no siblings, and rejects out-of-range selections', () => {
    const chain = setup();
    const block = chain.blockArray[0];
    const source = captureBlockProof(block, 0, chain.describer());
    expect(source.proofFor(0).path).toEqual([]);
    expect(source.txids[0]).toBe(source.root);
    expect(verifyProof(source.txids[0], [], source.root).valid).toBe(true);
    expect(() => captureBlockProof(block, 0, chain.describer(), 1)).toThrow(RangeError);
    expect(() => captureBlockProof(null, 1, chain.describer())).toThrow(RangeError);
  });
});

describe('workbench inclusion experiment', () => {
  it('opens the chosen transfer, fails after a sibling or TXID edit, and resets the same copy', () => {
    const chain = funded();
    const source = captureBlockProof(chain.blockArray[2], 2, chain.describer(), 1);
    const before = JSON.stringify(chain.toSaved());
    const report = vi.fn();
    render(<MerkleProof source={source} onLessonEvent={report} />);
    expect(screen.getByRole('region', { name: 'Workbench block copy' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Block size' })).toBeNull();
    expect(screen.getByLabelText('Transaction ID of transaction 1').value).toBe(source.txids[1]);
    const verdict = () => screen.getByRole('status').textContent;
    expect(verdict()).toMatch(/^Payment proven/);
    const sibling = screen.getByLabelText(/^Sibling at level 0/);
    fireEvent.change(sibling, { target: { value: flip(sibling.value) } });
    expect(verdict()).toMatch(/Payment not proven.*fails at level 1/);
    fireEvent.click(screen.getByRole('button', { name: 'Reset proof' }));
    expect(verdict()).toMatch(/^Payment proven/);
    fireEvent.change(screen.getByLabelText('Transaction ID of transaction 1'), { target: { value: flip(source.txids[1]) } });
    expect(verdict()).toMatch(/fails at level 0/);
    fireEvent.change(screen.getByLabelText('Transaction ID of transaction 1'), { target: { value: 'abc' } });
    expect(verdict()).toMatch(/no valid txid/);
    fireEvent.click(screen.getByRole('button', { name: 'Reset proof' }));
    expect(screen.getByLabelText('Transaction ID of transaction 1').value).toBe(source.txids[1]);
    expect(JSON.stringify(chain.toSaved())).toBe(before);
    cleanup();
    expect(report).not.toHaveBeenCalled();
  });
  it('explains a single transaction and can break its sibling-free proof', () => {
    const chain = setup();
    const source = captureBlockProof(chain.blockArray[0], 0, chain.describer());
    render(<MerkleProof source={source} />);
    expect(screen.queryByLabelText(/^Sibling at/)).toBeNull();
    expect(screen.getByText(/one-transaction block needs no siblings/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Transaction ID of transaction 0'), { target: { value: flip(source.txids[0]) } });
    expect(screen.getByRole('status').textContent).toMatch(/^Payment not proven/);
  });
  it('shows an existing header mismatch honestly and reset never repairs that block', () => {
    const chain = funded();
    chain.tamperTransaction(2, 1, 0.4);
    const source = captureBlockProof(chain.blockArray[2], 2, chain.describer(), 1);
    render(<MerkleProof source={source} />);
    expect(screen.getByText(/transactions no longer match the mined header/)).toBeTruthy();
    expect(screen.getByText('Does not match the mined header’s root')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('copied transactions produce a different root from the mined header');
    expect(screen.getByRole('status').textContent).toMatch(/^Payment not proven/);
    fireEvent.click(screen.getByRole('button', { name: 'Reset proof' }));
    expect(screen.getByRole('status').textContent).toMatch(/^Payment not proven/);
    expect(chain.isChainValid()).toBe(false);
  });
  it('isolates mission coaching and replaces a previous copy without retaining its edits', () => {
    const chain = funded();
    const first = captureBlockProof(chain.blockArray[2], 2, chain.describer(), 2);
    const report = vi.fn();
    const onBack = vi.fn();
    const useExample = vi.fn();
    const { rerender } = render(<ChainLab experiment="merkle" proofSource={first} onClose={onBack} onUseExample={useExample}
      coach={{ target: 'chain-lab.merkle-payment', mission: 'prove-a-payment' }} onLessonEvent={report} />);
    fireEvent.change(screen.getByLabelText('Transaction ID of transaction 2'), { target: { value: flip(first.txids[2]) } });
    const next = captureBlockProof(chain.blockArray[0], 0, chain.describer());
    rerender(<ChainLab experiment="merkle" proofSource={next} onClose={onBack} onUseExample={useExample} onLessonEvent={report} />);
    expect(screen.getByLabelText('Transaction ID of transaction 0').value).toBe(next.txids[0]);
    expect(within(screen.getByRole('list', { name: 'Proof path' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toMatch(/^Payment proven/);
    fireEvent.click(screen.getByRole('button', { name: 'Back to workbench' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use example block' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(useExample).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
  });
});
