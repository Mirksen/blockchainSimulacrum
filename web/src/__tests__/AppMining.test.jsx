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
    const run = { signal: options.signal, entrants: options.entrants.map(entrant => entrant.id), release: async () => resolve(await actual.search({ ...options, yieldControl: () => undefined })) };
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
// Let the whole chain of awaits after the search settle before React renders, as the
// browser's scheduler does, so App records the round it just finished.
const release = index => act(async () => { await controlled.runs[index].release(); await vi.advanceTimersByTimeAsync(0); });
const sound = () => screen.getByRole('button', { name: /^Sound/ });
const more = () => fireEvent.click(screen.getByRole('button', { name: 'More', exact: true }));
const wait = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const pending = () => document.querySelectorAll('.mempool-card-tx:not(.is-coinbase)');
// Start demo mines block #1 only (run 0); its distribution waits in the mempool.
async function completeDemo() {
  fireEvent.click(screen.getByRole('button', { name: 'Start demo', exact: true }));
  await release(0);
}
// One click on Mining mines one block (the next run).
async function mineOnce() {
  const run = controlled.runs.length;
  fireEvent.click(screen.getByRole('button', { name: 'Mining', exact: true }));
  expect(controlled.runs).toHaveLength(run + 1);
  await release(run);
}
// After the demo (run 0): Auto-mine on, then Play starts run 1.
async function startAutomatic() {
  await completeDemo();
  fireEvent.click(repeat());
  fireEvent.click(screen.getByRole('button', { name: 'Mining', exact: true }));
  expect(controlled.runs).toHaveLength(2);
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

  it('Auto-mine alone starts no search, on a fresh chain or after the demo', async () => {
    render(<App />);
    fireEvent.click(repeat());
    expect(repeat().getAttribute('aria-pressed')).toBe('true');
    await wait(6000);
    expect(controlled.runs).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Start demo', exact: true })).toBeTruthy();
    fireEvent.click(repeat());
    await completeDemo();
    await wait(6000);
    expect(controlled.runs).toHaveLength(1);
    fireEvent.click(repeat());
    await wait(6000);
    expect(controlled.runs).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Mining', exact: true })).toBeTruthy();
  });

  it('with Auto-mine on, Play mines block after block and Pause stays available between blocks', async () => {
    render(<App />);
    await startAutomatic();
    await release(1);
    expect(tiles()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Pause', exact: true })).toBeTruthy();
    await wait(1500);
    expect(controlled.runs).toHaveLength(3);
    await release(2);
    expect(tiles()).toHaveLength(4);
    await wait(1500);
    expect(controlled.runs).toHaveLength(4);
  });

  it('Start demo continues into the next block when Auto-mine is already on', async () => {
    render(<App />);
    fireEvent.click(repeat());
    await completeDemo();
    expect(tiles()).toHaveLength(2);
    await wait(1500);
    expect(controlled.runs).toHaveLength(2);
    await release(1);
    expect(tiles()).toHaveLength(3);
    expect(pending()).toHaveLength(0);
    await wait(1500);
    expect(controlled.runs).toHaveLength(3);
  });

  it('turning Auto-mine on during a single block continues after it', async () => {
    render(<App />);
    await completeDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Mining', exact: true }));
    fireEvent.click(repeat());
    await release(1);
    await wait(1500);
    expect(controlled.runs).toHaveLength(3);
  });

  it('turns repeat off during a block without cancelling it or starting another', async () => {
    render(<App />);
    await startAutomatic();
    fireEvent.click(repeat());
    expect(repeat().getAttribute('aria-pressed')).toBe('false');
    expect(controlled.runs[1].signal.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Pause', exact: true })).toBeTruthy();
    await release(1);
    expect(tiles()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Mining', exact: true })).toBeTruthy();
    await wait(6000);
    expect(controlled.runs).toHaveLength(2);
    expect(playMiningSuccessSound).toHaveBeenLastCalledWith(true);
  });

  it('turns repeat off between rounds; turning it on again starts nothing', async () => {
    render(<App />);
    await startAutomatic();
    await release(1);
    fireEvent.click(repeat());
    await wait(6000);
    expect(controlled.runs).toHaveLength(2);
    expect(tiles()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Mining', exact: true })).toBeTruthy();
    fireEvent.click(repeat());
    await wait(6000);
    expect(controlled.runs).toHaveLength(2);
  });

  it('a created miner shows a lane and wallet at once and races from the next block', async () => {
    render(<App />);
    await completeDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Create miner', exact: true }));
    fireEvent.change(screen.getByLabelText('New miner name'), { target: { value: 'Hal' } });
    fireEvent.click(within(screen.getByRole('form', { name: 'Create miner' })).getByRole('button', { name: 'Create' }));
    expect(document.querySelector('.next-block-lane[data-miner="Hal"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Open Hal, balance 0\.00000000/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mining', exact: true }));
    expect(controlled.runs[1].entrants).toEqual(['Miner One', 'Hal']);
    expect(screen.queryByRole('button', { name: 'Create miner', exact: true })).toBeNull();
  });

  it('shows the newest block until one is clicked and lets go on a second click', async () => {
    render(<App />);
    await completeDemo();
    await mineOnce();
    const shown = () => document.querySelector('section.selected-block .card-kit-title').textContent;
    const newest = tiles().length - 1;
    expect(newest).toBe(2);
    expect(shown()).toBe(`Block #${newest}`);
    fireEvent.click(tiles()[1]);
    expect(shown()).toBe('Block #1');
    fireEvent.click(tiles()[1]);
    expect(shown()).toBe(`Block #${newest}`);
  });

  it('fills the mempool only when Auto-transact is enabled and keeps transfers when disabled', async () => {
    render(<App />);
    await completeDemo();
    const transact = screen.getByRole('button', { name: 'Auto-transact', exact: true });
    expect(transact.getAttribute('aria-pressed')).toBe('false');
    // The demo distribution waits; Auto-transact fills only an empty mempool.
    expect(pending()).toHaveLength(1);
    fireEvent.click(transact);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(pending()).toHaveLength(1);
    fireEvent.click(transact);
    await mineOnce();
    expect(pending()).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(pending()).toHaveLength(0);
    fireEvent.click(transact);
    expect(transact.getAttribute('aria-pressed')).toBe('true');
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

  it('Pause aborts the active search and ends the run but keeps the Auto-mine setting', async () => {
    render(<App />);
    await startAutomatic();
    const sounds = playMiningSuccessSound.mock.calls.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true })); });
    expect(controlled.runs[1].signal.aborted).toBe(true);
    expect(repeat().getAttribute('aria-pressed')).toBe('true');
    expect(tiles()).toHaveLength(2);
    await wait(6000);
    expect(controlled.runs).toHaveLength(2);
    expect(playMiningSuccessSound.mock.calls.length).toBe(sounds);
  });

  it('Pause between automatic blocks clears the next scheduled search', async () => {
    render(<App />);
    await startAutomatic();
    await release(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true }));
    await wait(6000);
    expect(controlled.runs).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Mining', exact: true })).toBeTruthy();
  });

  it('uses mute changes made while mining, including enabling sound again before completion', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start demo', exact: true }));
    more();
    fireEvent.click(sound());
    await release(0);
    expect(playMiningSuccessSound).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Mining', exact: true }));
    more();
    unlockMiningAudio.mockClear();
    fireEvent.click(sound());
    expect(unlockMiningAudio).toHaveBeenCalled();
    await release(1);
    expect(playMiningSuccessSound).toHaveBeenLastCalledWith(true);
  });

  it('Start demo mines exactly block #1 and leaves the distribution waiting in the mempool', async () => {
    render(<App />);
    await completeDemo();
    expect(controlled.runs).toHaveLength(1);
    expect(tiles()).toHaveLength(2);
    expect(document.querySelector('[data-round="last"] .next-block-summary').textContent).toContain('Last round #1');
    const waiting = [...pending()].map(row => row.textContent);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toContain('Miner One → Wallet Two');
    expect(waiting[0]).toContain('Demo distribution');
    // Nothing else is mined until the next click.
    await wait(6000);
    expect(controlled.runs).toHaveLength(1);
    expect(tiles()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Mining', exact: true })).toBeTruthy();
  });

  it('one click on Mining after the demo mines exactly block #2 with the waiting transfers', async () => {
    render(<App />);
    await completeDemo();
    await mineOnce();
    expect(controlled.runs).toHaveLength(2);
    expect(tiles()).toHaveLength(3);
    expect(pending()).toHaveLength(0);
    expect(tiles()[2].textContent).toContain('2 tx');
    expect(document.querySelector('[data-round="last"] .next-block-summary').textContent).toContain('Last round #2');
    expect(document.querySelector('section.selected-block .card-kit-title').textContent).toBe('Block #2');
    expect(document.querySelector('section.selected-block').textContent).toContain('Wallet Two');
    await wait(6000);
    expect(controlled.runs).toHaveLength(2);
    expect(tiles()).toHaveLength(3);
  });

  it('opens the checks on tampering and lets the pill close them while the chain is invalid', async () => {
    render(<App />);
    await completeDemo();
    await mineOnce();
    const band = () => document.querySelector('.wb-band');
    const checks = () => within(band()).queryByRole('list', { name: 'Checks per block' });
    expect(within(band()).getByRole('button', { name: 'Chain valid' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tiles()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Tamper with this block' }));
    const form = screen.getByRole('form', { name: 'Change a transaction amount in block 1' });
    fireEvent.change(within(form).getByLabelText('New amount'), { target: { value: '9' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change amount' }));
    const invalid = () => within(band()).getByRole('button', { name: 'Chain invalid' });
    expect(invalid().getAttribute('aria-expanded')).toBe('true');
    expect(checks()).toBeTruthy();
    fireEvent.click(invalid());
    expect(invalid().getAttribute('aria-expanded')).toBe('false');
    expect(checks()).toBeNull();
    fireEvent.click(invalid());
    expect(invalid().getAttribute('aria-expanded')).toBe('true');
    expect(checks()).toBeTruthy();
  });
});

describe('lowering the difficulty by hand (ADR 0004)', () => {
  beforeEach(() => {
    // jsdom has no native dialog methods; browser checks cover the real modal.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
  });
  const shown = () => screen.getByLabelText('Difficulty', { selector: 'output' }).textContent;
  const lower = () => fireEvent.click(screen.getByRole('button', { name: 'Lower difficulty' }));
  const raise = () => fireEvent.click(screen.getByRole('button', { name: 'Raise difficulty' }));
  const warning = () => screen.queryByRole('dialog', { name: 'Lowering the difficulty starts a new chain' });

  it('lowers a genesis-only chain without asking', () => {
    render(<App />);
    raise();
    expect(shown()).toBe('2');
    lower();
    expect(warning()).toBeNull();
    expect(shown()).toBe('1');
  });

  it('raises a mined chain without asking, and lowers it only with a new chain after the warning', async () => {
    render(<App />);
    await completeDemo();
    expect(tiles()).toHaveLength(2);
    raise();
    expect(warning()).toBeNull();
    expect(shown()).toBe('2');

    lower();
    expect(warning()).not.toBeNull();
    expect(within(warning()).getByText(/removes the 1 mined block,/)).toBeTruthy();
    expect(document.activeElement).toBe(within(warning()).getByRole('button', { name: 'Keep chain' }));
    fireEvent.click(within(warning()).getByRole('button', { name: 'Keep chain' }));
    expect(warning()).toBeNull();
    expect(shown()).toBe('2');
    expect(tiles()).toHaveLength(2);

    lower();
    fireEvent.click(within(warning()).getByRole('button', { name: 'Start new chain at 1' }));
    expect(warning()).toBeNull();
    expect(shown()).toBe('1');
    expect(tiles()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Start demo', exact: true })).toBeTruthy();
  });
});
