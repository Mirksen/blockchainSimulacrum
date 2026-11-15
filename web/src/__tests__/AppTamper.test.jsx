// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { reduce } from '../lib/missions';

// Real App, hook and chain; the search is held and released through the real hasher (as in
// AppMining.test.jsx). `refuse` makes every tamper ask the chain for a sub-satoshi amount,
// which the chain refuses, so App sees exactly what the chain answered.
const controlled = vi.hoisted(() => ({ runs: [], walletSequence: 0, refuse: false }));
vi.mock('../lib/wallet', async importOriginal => ({ ...await importOriginal(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++controlled.walletSequence;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
vi.mock('../hooks/useBlockchain', async importOriginal => {
  const actual = await importOriginal();
  return { useBlockchain: (config, options) => {
    const sim = actual.useBlockchain({ ...config, miningDifficulty: 1, participants: ['Miner One', 'Wallet Two'], miners: ['Miner One'] }, options);
    return controlled.refuse ? { ...sim, tamperBlock: (block, tx, amount) => sim.tamperBlock(block, tx, amount + 1e-9) } : sim;
  } };
});
vi.mock('../lib/powSearch', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, runSearch: vi.fn(options => new Promise(resolve => {
    controlled.runs.push({ release: async () => resolve(await actual.search({ ...options, yieldControl: () => undefined })) });
    options.signal.addEventListener('abort', () => resolve({ status: 'stopped', attempts: 0, entrants: {} }), { once: true });
  })) };
});
vi.mock('../lib/missions', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, reduce: vi.fn(actual.reduce) };
});
vi.mock('../lib/sound', () => ({ unlockMiningAudio: vi.fn(async () => true), playMiningSuccessSound: vi.fn(), playRecordSound: vi.fn() }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));
  localStorage.clear();
  history.replaceState(null, '', '/');
  controlled.runs.length = 0;
  controlled.walletSequence = 0;
  controlled.refuse = false;
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const band = () => within(document.querySelector('.wb-band'));
const reported = type => reduce.mock.calls.filter(([, event]) => event.type === type);
async function mineDemoBlock() {
  fireEvent.click(screen.getByRole('button', { name: 'Start demo', exact: true }));
  await act(async () => { await controlled.runs[0].release(); await vi.advanceTimersByTimeAsync(0); });
}
function tamperFirstBlock(amount) {
  fireEvent.click(band().getAllByRole('button', { name: /^Block 1(,|$)/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Tamper with this block' }));
  const form = screen.getByRole('form', { name: 'Change a transaction amount in block 1' });
  fireEvent.change(within(form).getByLabelText('New amount'), { target: { value: amount } });
  fireEvent.click(within(form).getByRole('button', { name: 'Change amount' }));
}

describe('tampering in App', () => {
  it('reports and opens the repair only for an edit the chain applied', async () => {
    render(<App />);
    await mineDemoBlock();
    tamperFirstBlock('2');
    expect(reported('block_tampered')).toHaveLength(1);
    expect(band().getByRole('button', { name: 'Chain invalid' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('a refused edit changes nothing, reports nothing and opens no repair', async () => {
    controlled.refuse = true;
    render(<App />);
    await mineDemoBlock();
    tamperFirstBlock('2');
    expect(reported('block_tampered')).toHaveLength(0);
    expect(band().queryByRole('button', { name: 'Chain invalid' })).toBeNull();
    expect(band().getByRole('button', { name: 'Chain valid' }).getAttribute('aria-expanded')).toBe('false');
  });
});
