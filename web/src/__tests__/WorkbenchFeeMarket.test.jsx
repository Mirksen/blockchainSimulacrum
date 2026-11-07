// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Workbench } from '../components/workbench/Workbench';
import { candidateHash, createBlockchain } from '../lib/blockchain';
import { meetsTarget } from '../../../shared/bitcoin-block.mjs';

const fixture = vi.hoisted(() => ({ wallet: 0 }));
vi.mock('../lib/wallet', async original => ({ ...await original(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++fixture.wallet;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
vi.mock('../components/workbench/MinerName', () => ({ MinerName: () => null }));
beforeEach(() => { fixture.wallet = 0; vi.spyOn(Date, 'now').mockReturnValue(1767355200000); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mine(chain) {
  const candidate = chain.prepareCandidate(chain.getActiveMiner());
  let nonce = 0;
  while (!meetsTarget(candidateHash(candidate, nonce), candidate.bits)) nonce++;
  expect(chain.acceptBlock(candidate, nonce, candidateHash(candidate, nonce)).status).toBe('accepted');
}
function fundedBatch() {
  const chain = createBlockchain({ participants: ['Miner Fixture', 'Wallet A', 'Wallet B', 'Wallet C'], miners: ['Miner Fixture'], miningDifficulty: 1 });
  mine(chain);
  for (const name of ['Wallet A', 'Wallet B', 'Wallet C']) chain.createTransactionAtRate('Miner Fixture', name, 0.5, 1);
  mine(chain);
  const names = ['Wallet A', 'Wallet B', 'Wallet C'];
  for (let index = 0; index < 8; index++) chain.createTransactionAtRate(names[index % 3], names[(index + 1) % 3], 0.01, [1, 2, 5, 10, 20][index % 5], 'Demo transfer');
  expect(chain.isChainValid()).toBe(true);
  expect(chain.blockTemplate().included).toHaveLength(5);
  expect(chain.blockTemplate().waiting).toHaveLength(3);
  return chain;
}
function view(chain, isMining = false) {
  return { blocks: [...chain.blockArray], memPool: [...chain.memPool], participants: chain.participants,
    balances: chain.getAllBalances(), blockStatus: chain.inspectBlocks(), tamperedEdits: chain.getTamperedEdits(),
    describeTx: chain.describer(), blockTemplate: chain.blockTemplate(), difficulty: chain.miningDifficulty,
    blockReward: chain.blockReward, halvingInterval: chain.halvingEvent, isMining, minerProgress: {}, miningProgress: null };
}
const props = { coinName: 'FixtureCoin', targetSeconds: 10, selectedIndex: null, remining: null };

describe('workbench fee-market counts', () => {
  it('describes only the visible activity tail, and reuses it during mining progress', () => {
    const chain = createBlockchain({ participants: ['Miner Fixture'], miners: ['Miner Fixture'], miningDifficulty: 1 });
    for (let i = 0; i < 40; i++) mine(chain);
    const sim = view(chain);
    const original = sim.describeTx;
    sim.describeTx = vi.fn(original);
    const { rerender } = render(<Workbench {...props} selectedIndex={0} sim={sim} />);
    // The selected genesis is separate; Activity needs at most its 12 visible payments.
    expect(sim.describeTx.mock.calls.filter(([tx]) => tx !== chain.blockArray[0].transactions[0]).length).toBeLessThanOrEqual(12);
    sim.describeTx.mockClear();
    rerender(<Workbench {...props} selectedIndex={0} sim={{ ...sim, isMining: true, miningProgress: { iterations: 100, elapsedMs: 50 } }} />);
    expect(sim.describeTx.mock.calls.filter(([tx]) => tx !== chain.blockArray[0].transactions[0])).toHaveLength(0);
  });
  it('shows five candidate payments before and during mining, with eight still pending', () => {
    const chain = fundedBatch();
    const { rerender } = render(<Workbench {...props} sim={view(chain)} />);
    expect(screen.getByRole('group', { name: /^Candidate block 3,/ }).getAttribute('aria-label')).toContain('5 transactions');
    expect(document.querySelector('.next-block-meta').textContent).toContain('5 tx selected');
    expect(screen.getByRole('region', { name: 'Mempool' }).textContent).toContain('8 pending');
    rerender(<Workbench {...props} sim={view(chain, true)} />);
    expect(screen.getByRole('group', { name: /^Candidate block 3,/ }).getAttribute('aria-label')).toContain('5 transactions');
    expect(document.querySelector('.next-block-meta').textContent).toContain('5 tx');
    expect(screen.getByRole('region', { name: 'Mempool' }).textContent).toContain('5 in #3');
    expect(screen.getByRole('region', { name: 'Mempool' }).textContent).toContain('8 pending · 3 waiting');
  });

  it('counts the historical block during repair and re-mining, keeping the mempool separate', () => {
    const chain = fundedBatch();
    // A broken header leaves the real signed ledger/payments intact, a repairable history fixture.
    chain.blockArray[2].hash = 'f'.repeat(64);
    expect(chain.inspectBlocks()[2].status).not.toBe('valid');
    const { rerender } = render(<Workbench {...props} sim={view(chain)} />);
    expect(chain.blockArray[2].transactions).toHaveLength(4);
    expect(screen.getByRole('region', { name: 'Next block 2, paused while the chain is invalid' })).toBeTruthy();
    expect(document.querySelector('.next-block-meta').textContent).toContain('3 tx selected');
    rerender(<Workbench {...props} sim={view(chain, true)} remining={2} />);
    expect(screen.getByRole('region', { name: 'Next block 2, being mined' })).toBeTruthy();
    expect(document.querySelector('.next-block-meta').textContent).toContain('3 tx');
    const mempool = screen.getByRole('region', { name: 'Mempool' });
    expect(mempool.textContent).toContain('8 pending');
    expect(mempool.textContent).toContain('waiting during re-mine #2');
    expect(mempool.textContent).not.toContain('being mined into');
  });
});
