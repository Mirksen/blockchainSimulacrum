// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { initialProgress, MISSIONS, STORAGE_KEY } from '../lib/missions';
import { START_KEY } from '../lib/startChoice';
import { TOUR_KEY } from '../lib/tour';

// The arrival tour in the real App (as AppStart.test.jsx): the simulator runs on a test session;
// the workbench is a stand-in with the five tour regions and the coach target of the first
// workbench mission, and records the coach it is handed.
vi.mock('../hooks/useMinerIdentity', () => ({ useMinerIdentity: () => ({ name: 'Not-Satoshi-4', setName: () => {}, signer: null }) }));
const fixtureKeys = vi.hoisted(() => ({ wallet: 0 }));
vi.mock('../lib/wallet', async importOriginal => ({ ...await importOriginal(), deriveWallet: () => {
  const privateKey = new Uint8Array(32);
  privateKey[31] = ++fixtureKeys.wallet % 250 + 1;
  return { privateKey, seedPhrase: 'synthetic wallet fixture' };
} }));
vi.mock('../hooks/useWorkbenchSession', async importOriginal => {
  const actual = await importOriginal();
  const { useState } = await import('react');
  const { createTestClock, inlineSearch, memoryStore } = await import('../lib/workbenchSession');
  return { ...actual, useWorkbenchSession: config => {
    const [clock] = useState(createTestClock);
    return actual.useWorkbenchSession({ ...config, miningDifficulty: 1 }, { store: memoryStore(), clock, search: inlineSearch(clock) });
  } };
});
const bench = vi.hoisted(() => ({ coach: undefined }));
vi.mock('../components/workbench/Workbench', () => ({ Workbench: ({ coach }) => {
  bench.coach = coach;
  return (
    <div data-testid="workbench">
      {['chain', 'block', 'next', 'mempool', 'wallets'].map(id => <section key={id} data-tour={id} aria-label={`Region ${id}`} />)}
      <span data-coach-target="workbench.start-demo" className={coach?.target === 'workbench.start-demo' ? 'coach-mark is-active' : 'coach-mark'}>
        <button type="button">Start demo</button>
      </span>
    </div>
  );
} }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => <div data-testid="ticker" /> }));
vi.mock('../components/HashLab', () => ({ HashLab: ({ lesson }) => <section aria-label="Hash experiment">{lesson ?? 'Free hash lab'}</section> }));
vi.mock('../components/PoolPanel', () => ({ PoolPanel: () => <section aria-label="Leaderboard view">Board</section> }));
vi.mock('../components/basics/BasicsCourse', () => ({ BasicsCourse: () => <section aria-label="Basics course">Course</section> }));

const RAIL = 'proofofwork-rail-collapsed';
const LOAD = { timeout: 30000 };
// A guided learner who finished the course and both lab missions: the next step is on the workbench.
const BEFORE_WORKBENCH = MISSIONS.slice(0, MISSIONS.findIndex(mission => mission.id === 'send-first-coin')).map(mission => mission.id);
const guided = (choice, { rail = '0' } = {}) => {
  localStorage.setItem(START_KEY, choice);
  localStorage.setItem(RAIL, rail);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialProgress(), completed: BEFORE_WORKBENCH }));
};
const tour = () => screen.queryByRole('dialog');
const press = name => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }));
const walk = () => { for (let stop = 0; stop < 4; stop++) press('Next'); press('Done'); };
const openFromMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tour of the simulator' }));
};

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  bench.coach = undefined;
  vi.stubGlobal('requestAnimationFrame', callback => callback());
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('the arrival tour opens by itself', () => {
  it('once for "Hashes are new to me", in plain words, without the coach mark while it runs', () => {
    guided('new');
    render(<App />);
    const card = screen.getByRole('dialog', { name: 'The notebook' });
    expect(within(card).getByText('Stop 1 of 5')).toBeTruthy();
    expect(document.activeElement).toBe(card);
    expect(bench.coach).toBeNull();
    expect(document.querySelector('.coach-mark.is-active')).toBeNull();
    walk();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(TOUR_KEY)).toBe('1');
    // The coach mark returns and focus goes to the control the active step needs.
    expect(bench.coach).toMatchObject({ mission: 'send-first-coin', target: 'workbench.start-demo' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start demo' }));
    cleanup();
    render(<App />);
    expect(screen.getByTestId('workbench')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bench.coach).toMatchObject({ target: 'workbench.start-demo' });
  });

  it('for "I know what a hash is", in technical words', () => {
    guided('hash');
    render(<App />);
    expect(screen.getByRole('dialog', { name: 'The chain' })).toBeTruthy();
  });

  it('and Skip tour marks it seen as well', () => {
    guided('new');
    render(<App />);
    press('Skip tour');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(TOUR_KEY)).toBe('1');
    expect(bench.coach).toMatchObject({ target: 'workbench.start-demo' });
  });

  it('and Escape skips it', () => {
    guided('hash');
    render(<App />);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(TOUR_KEY)).toBe('1');
  });

  it('not for "Just let me play"', () => {
    guided('play');
    render(<App />);
    expect(screen.getByTestId('workbench')).toBeTruthy();
    expect(tour()).toBeNull();
    expect(bench.coach).toMatchObject({ target: 'workbench.start-demo' });
  });

  it('not with the missions collapsed', () => {
    guided('new', { rail: '1' });
    render(<App />);
    expect(screen.getByTestId('workbench')).toBeTruthy();
    expect(tour()).toBeNull();
  });

  it('not after it was seen', () => {
    guided('new');
    localStorage.setItem(TOUR_KEY, '1');
    render(<App />);
    expect(tour()).toBeNull();
  });

  it('not on other views, but on arrival at the workbench', async () => {
    guided('new');
    history.replaceState(null, '', '/#/hash-lab');
    render(<App />);
    expect(await screen.findByText('Free hash lab', {}, LOAD)).toBeTruthy();
    expect(tour()).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Workbench' }));
    expect(screen.getByRole('dialog', { name: 'The notebook' })).toBeTruthy();
  });

  it('and leaving the workbench ends it for good', async () => {
    guided('new');
    render(<App />);
    expect(tour()).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Hash lab' }));
    expect(await screen.findByText('Free hash lab', {}, LOAD)).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Workbench' }));
    expect(tour()).toBeNull();
    expect(localStorage.getItem(TOUR_KEY)).toBe('1');
  });
});

describe('Tour of the simulator in the menu', () => {
  it('starts the tour for a free player, in technical words, and ends on the workbench', () => {
    localStorage.setItem(START_KEY, 'play');
    render(<App />);
    expect(tour()).toBeNull();
    openFromMenu();
    const card = screen.getByRole('dialog', { name: 'The chain' });
    expect(document.activeElement).toBe(card);
    walk();
    expect(screen.queryByRole('dialog')).toBeNull();
    // No active workbench step in free play: focus goes to the workbench itself.
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('navigates to the workbench and starts again after the tour was seen', async () => {
    guided('new');
    localStorage.setItem(TOUR_KEY, '1');
    history.replaceState(null, '', '/#/hash-lab');
    render(<App />);
    expect(await screen.findByText('Free hash lab', {}, LOAD)).toBeTruthy();
    openFromMenu();
    expect(location.hash).toBe('#/');
    expect(screen.getByRole('dialog', { name: 'The notebook' })).toBeTruthy();
    expect(bench.coach).toBeNull();
    press('Next');
    // From the menu again: back to the first stop.
    openFromMenu();
    expect(within(screen.getByRole('dialog')).getByText('Stop 1 of 5')).toBeTruthy();
  });
});
