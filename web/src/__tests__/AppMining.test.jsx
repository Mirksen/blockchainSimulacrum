// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { unlockMiningAudio, playMiningSuccessSound } from '../lib/sound';

const controlled = vi.hoisted(() => ({ runs: [], config: null, walletSequence: 0 }));
// Keep real App, controls, hook and proof verification. Hold only the search
// boundary, then release it through the real hasher so completion is deterministic.
// Control timing is independent of proof difficulty; use a one-zero synthetic
// fixture while recording the actual default config passed by App.
// These tests exercise control timing and real signed blocks, not BIP39 key
// derivation (covered in wallet.test.js). Use fresh, deterministic fixture keys.
vi.mock('../lib/wallet', async importOriginal => ({ ...await importOriginal(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++controlled.walletSequence;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
vi.mock('../hooks/useBlockchain', async importOriginal => {
  const actual = await importOriginal();
  return { useBlockchain: config => {
    controlled.config = config;
    return actual.useBlockchain({ ...config, miningDifficulty: 1,
      participants: ['Miner One', 'Wallet Two'], miners: ['Miner One'] });
  } };
});
vi.mock('../lib/powSearch', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, runSearch: vi.fn(options => new Promise(resolve => {
    const run = { signal: options.signal, release: async () => resolve(await actual.search({ ...options, yieldControl: () => undefined })) };
    controlled.runs.push(run);
    options.signal.addEventListener('abort', () => resolve({ status: 'stopped', attempts: 0, entrants: {} }), { once: true });
  })) };
});
vi.mock('../lib/sound', () => ({ unlockMiningAudio: vi.fn(async () => true), playMiningSuccessSound: vi.fn() }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));
  localStorage.clear();
  history.replaceState(null, '', '/');
  controlled.runs.length = 0;
  controlled.walletSequence = 0;
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const repeat = () => screen.getByRole('button', { name: 'Auto-mine', exact: true });
const tiles = () => within(document.querySelector('.wb-band')).getAllByRole('button', { name: /^(Genesis block 0|Block \d+)(,|$)/ });
const release = index => act(async () => { await controlled.runs[index].release(); });
const sound = () => screen.getByRole('button', { name: /^Sound/ });
const more = () => fireEvent.click(screen.getByRole('button', { name: 'More', exact: true }));
async function startAutomatic() {
  fireEvent.click(repeat());
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(controlled.runs).toHaveLength(1);
}
async function completeDemo() {
  fireEvent.click(screen.getByRole('button', { name: 'Start demo', exact: true }));
  await release(0);
  await release(1);
}

describe('mining controls and sound in App', () => {
  it('defaults to sound on and unlocks audio during a gesture before a delayed result', async () => {
    render(<App />);
    expect(controlled.config.miningDifficulty).toBe(4);
    more();
    expect(sound().getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await completeDemo();
    expect(unlockMiningAudio).toHaveBeenCalled();
    expect(playMiningSuccessSound).toHaveBeenLastCalledWith(true);
  });

  it('turns repeat off during the first automatic block without cancelling it or starting another', async () => {
    render(<App />);
    await startAutomatic();
    fireEvent.click(repeat());
    expect(repeat().getAttribute('aria-pressed')).toBe('false');
    expect(controlled.runs[0].signal.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Pause', exact: true })).toBeTruthy();
    await release(0);
    expect(tiles()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Mining', exact: true })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(controlled.runs).toHaveLength(1);
    expect(playMiningSuccessSound).toHaveBeenLastCalledWith(true);
  });

  it('turns repeat off between rounds and clears the next scheduled search', async () => {
    render(<App />);
    await startAutomatic();
    await release(0);
    expect(tiles()).toHaveLength(2);
    fireEvent.click(repeat());
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(controlled.runs).toHaveLength(1);
    expect(tiles()).toHaveLength(2);
  });

  it('shows the newest block until one is clicked and lets go on a second click', async () => {
    render(<App />);
    await completeDemo();
    const shown = () => document.querySelector('section.selected-block .card-kit-title').textContent;
    const newest = tiles().length - 1;
    expect(shown()).toBe(`Block #${newest}`);
    fireEvent.click(tiles()[1]);
    expect(shown()).toBe('Block #1');
    fireEvent.click(tiles()[1]);
    expect(shown()).toBe(`Block #${newest}`);
  });

  it('fills the mempool only when Auto-transact is enabled and keeps transfers when disabled', async () => {
    render(<App />);
    await completeDemo();
    const pending = () => document.querySelectorAll('.mempool-card-tx:not(.is-coinbase)');
    expect(pending()).toHaveLength(0);
    const transact = screen.getByRole('button', { name: 'Auto-transact', exact: true });
    expect(transact.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(transact);
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(pending().length).toBeGreaterThan(0);
    const count = pending().length;
    expect(repeat().getAttribute('aria-pressed')).toBe('false');
    expect(controlled.runs).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(pending()).toHaveLength(count);
    fireEvent.click(transact);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(pending()).toHaveLength(count);
  });

  it('Pause still aborts the active search and repeat', async () => {
    render(<App />);
    await startAutomatic();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true })); });
    expect(controlled.runs[0].signal.aborted).toBe(true);
    expect(repeat().getAttribute('aria-pressed')).toBe('false');
    expect(tiles()).toHaveLength(1);
    expect(playMiningSuccessSound).not.toHaveBeenCalled();
  });

  it('uses mute changes made while mining, including enabling sound again before completion', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start demo', exact: true }));
    await release(0);
    more();
    fireEvent.click(sound());
    await release(1);
    expect(playMiningSuccessSound).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Mining', exact: true }));
    more();
    unlockMiningAudio.mockClear();
    fireEvent.click(sound());
    expect(unlockMiningAudio).toHaveBeenCalled();
    await release(2);
    expect(playMiningSuccessSound).toHaveBeenLastCalledWith(true);
  });
});
