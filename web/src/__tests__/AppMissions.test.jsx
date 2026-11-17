// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { initialProgress, MISSIONS, STORAGE_KEY } from '../lib/missions';
import { START_KEY } from '../lib/startChoice';
import { telemetry } from '../lib/telemetry';

// Keep real App, rail, start question, progress storage and Workbench with a test session. Lab
// internals are covered separately; their evidence callbacks exercise the real App wiring here.
// No signer: the simulator's blocks are signed for nobody's leaderboard entry.
vi.mock('../hooks/useMinerIdentity', () => ({ useMinerIdentity: () => ({ name: 'Not-Satoshi-4', setName: () => {}, signer: null }) }));
// The real client without a token, with track recorded: the counting events of App.
vi.mock('../lib/telemetry', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, telemetry: { ...actual.telemetry, track: vi.fn(async () => false) } };
});
// A test session: an in-memory store and a clock only the test moves (lib/workbenchSession.js),
// over synthetic fixture keys instead of BIP39 derivation (covered in wallet.test.js).
// The clock of the mounted session is the test's, so a test can let a race finish.
const fixtureKeys = vi.hoisted(() => ({ wallet: 0, clock: null }));
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
    fixtureKeys.clock = clock;
    return actual.useWorkbenchSession({ ...config, miningDifficulty: 1 }, { store: memoryStore(), clock, search: inlineSearch(clock) });
  } };
});
// The real Workbench; beside it the coach App hands it, for the assertions on free play.
vi.mock('../components/workbench/Workbench', async importOriginal => {
  const { Workbench } = await importOriginal();
  return { Workbench: props => <><span data-testid="workbench-coach" hidden>{props.coach?.target ?? 'Free play'}</span><Workbench {...props} /></> };
});
vi.mock('../components/workbench/TopBar', () => ({ TopBar: ({ onNavigate }) =>
  <nav><button onClick={() => onNavigate('hash-lab')}>Hash lab</button>
    <button onClick={() => onNavigate('workbench')}>Workbench</button></nav> }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => null }));
vi.mock('../components/HashLab', () => ({ HashLab: ({ lesson, coach, onLessonEvent }) =>
  <section aria-label="Hash experiment">
    <span>{lesson ?? 'Free hash lab'}</span><span>{coach?.target ?? 'No coach'}</span>
    <button onClick={() => onLessonEvent?.({ type: 'manual_hash_found', hash: '0' + 'a'.repeat(63) })}>Complete manual proof</button>
  </section> }));
// The course host has its own tests; here it shows what App hands it and replays the
// evidence of the first scene.
vi.mock('../components/basics/BasicsCourse', () => ({ BasicsCourse: ({ coach, onLessonEvent }) =>
  <section aria-label="Basics course">
    <span>{coach?.target ?? 'No coach'}</span><span>{onLessonEvent ? 'Guided basics' : 'Free basics'}</span>
    <button onClick={() => ['photo', 'double-spend', 'rejected'].forEach(kind => onLessonEvent?.({ type: 'copy_tried', kind }))}>
      Complete the copy problem</button>
  </section> }));

const RAIL = 'proofofwork-rail-collapsed';
const BASICS = MISSIONS.filter(mission => mission.chapter === 'basics').map(mission => mission.id);
const LOAD = { timeout: 30000 };
const startQuestion = () => screen.queryByRole('region', { name: 'Where do you want to start?' });
const rail = () => within(document.querySelector('.wb-rail'));
const mobile = () => within(document.querySelector('.wb-mbar'));
const collapsed = () => document.querySelector('.app-shell').classList.contains('is-rail-collapsed');
const reload = () => { cleanup(); render(<App />); };
const course = () => screen.findByRole('region', { name: 'Basics course' }, LOAD);
const completedCounts = () => telemetry.track.mock.calls.filter(([name]) => name === 'mission_completed').map(([, properties]) => properties);

beforeEach(() => {
  telemetry.track.mockClear();
  localStorage.clear();
  // A returning visitor who answered the start question with "Just let me play"
  // (the first visit itself: AppStart.test.jsx).
  localStorage.setItem(START_KEY, 'play');
  history.replaceState(null, '', '/');
  vi.stubGlobal('requestAnimationFrame', callback => callback());
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('optional missions in App', () => {
  it('starts in free play everywhere and stays there after reload', () => {
    render(<App />);
    expect(collapsed()).toBe(true);
    expect(startQuestion()).toBeNull();
    expect(screen.getByTestId('workbench-coach').textContent).toBe('Free play');
    expect(mobile().getByRole('button', { name: 'Open missions' }).textContent).toBe('Missions');
    expect(document.activeElement).toBe(document.body);
    reload();
    expect(startQuestion()).toBeNull();
    expect(collapsed()).toBe(true);
  });

  it('keeps the free labs usable without touching progress', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Hash lab', exact: true }));
    expect(await screen.findByText('Free hash lab', {}, LOAD)).toBeTruthy();
    expect(screen.getByText('No coach')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Complete manual proof' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed).toEqual([]);
    reload();
    expect(startQuestion()).toBeNull();
    expect(collapsed()).toBe(true);
  });

  it('remembers explicit expansion and collapse without losing completed missions', async () => {
    const progress = { ...initialProgress(), completed: BASICS };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    render(<App />);
    fireEvent.click(rail().getByRole('button', { name: 'Expand mission rail' }));
    expect(localStorage.getItem(RAIL)).toBe('0');
    // The active mission is a lab experiment: expanding alone leaves the workbench open.
    expect(screen.getByTestId('workbench-coach').textContent).toBe('hash-lab.search');
    reload();
    expect(collapsed()).toBe(false);
    expect(document.querySelector('.wb-rail .mission-rail-xp').textContent).toBe('100 XP1 badge6 of 17 done');
    fireEvent.click(rail().getByRole('button', { name: 'Show me' }));
    expect(await screen.findByText('work', {}, LOAD)).toBeTruthy();
    expect(screen.getByText('hash-lab.search')).toBeTruthy();
    fireEvent.click(rail().getByRole('button', { name: 'Collapse mission rail' }));
    expect(await screen.findByText('Free hash lab', {}, LOAD)).toBeTruthy();
    expect(screen.getByText('No coach')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual(progress);
    reload();
    expect(collapsed()).toBe(true);
    expect(localStorage.getItem(RAIL)).toBe('1');
  });

  it('starts missions voluntarily in the course and preserves newly earned progress when hidden', async () => {
    render(<App />);
    fireEvent.click(rail().getByRole('button', { name: 'Expand mission rail' }));
    expect(collapsed()).toBe(false);
    // The first mission is a Basics scene, so opening the missions opens the course.
    await course();
    expect(location.hash).toBe('#/basics');
    expect(screen.getByText('basics.copy-photo')).toBeTruthy();
    expect(screen.getByText('Guided basics')).toBeTruthy();
    expect(completedCounts()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Complete the copy problem' }));
    expect(document.querySelector('.wb-rail .mission-rail-xp').textContent).toBe('10 XP0 badges1 of 17 done');
    expect(completedCounts()).toEqual([{ mission: 'copy-problem' }]);
    fireEvent.click(rail().getByRole('button', { name: 'Collapse mission rail' }));
    reload();
    expect(collapsed()).toBe(true);
    expect(startQuestion()).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed).toEqual(['copy-problem']);
    // Hiding the missions and the reload count nothing more.
    expect(completedCounts()).toEqual([{ mission: 'copy-problem' }]);
  });

  it('enables lessons from mobile access, then hides tasks and coaches using Hide missions', async () => {
    render(<App />);
    fireEvent.click(mobile().getByRole('button', { name: 'Open missions' }));
    expect(collapsed()).toBe(false);
    const sheet = screen.getByRole('dialog', { name: 'Missions' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Show me' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await course();
    expect(screen.getByText('basics.copy-photo')).toBeTruthy();
    fireEvent.click(mobile().getByRole('button', { name: 'Hide missions' }));
    expect(collapsed()).toBe(true);
    expect(screen.getByText('Free basics')).toBeTruthy();
    expect(screen.getByText('No coach')).toBeTruthy();
    reload();
    expect(mobile().getByRole('button', { name: 'Open missions' }).textContent).toBe('Missions');
  });

  it.each(['invalid', null])('defaults to collapsed for an absent or invalid preference (%s)', stored => {
    if (stored !== null) localStorage.setItem(RAIL, stored);
    render(<App />);
    expect(collapsed()).toBe(true);
  });

  it('honours an existing expanded preference', () => {
    localStorage.setItem(RAIL, '0');
    render(<App />);
    expect(collapsed()).toBe(false);
    expect(startQuestion()).toBeNull();
    expect(screen.getByTestId('workbench-coach').textContent).toBe('basics.copy-photo');
  });

  it('completes a workbench mission end to end: the real Workbench, session and evidence', async () => {
    const before = MISSIONS.findIndex(mission => mission.id === 'send-first-coin');
    localStorage.setItem(RAIL, '0');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialProgress(), completed: MISSIONS.slice(0, before).map(mission => mission.id) }));
    render(<App />);
    expect(screen.getByTestId('workbench-coach').textContent).toBe('workbench.new-transaction');
    const race = async name => {
      fireEvent.click(screen.getByRole('button', { name, exact: true }));
      await act(() => fixtureKeys.clock.advance(0));
    };
    // The demo's block and its distribution are no transaction of the learner's.
    await race('Start demo');
    await race('Mining');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed).toHaveLength(before);
    // The missions loaded as completed are not counted.
    expect(completedCounts()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }));
    const form = screen.getByRole('form', { name: 'New transaction' });
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: 'Alice' } });
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: 'Bob' } });
    fireEvent.change(within(form).getByLabelText(/^Amount/), { target: { value: '0.1' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add to mempool' }));
    expect(screen.queryByRole('form', { name: 'New transaction' })).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed).toEqual(MISSIONS.slice(0, before + 1).map(mission => mission.id));
    expect(completedCounts()).toEqual([{ mission: 'send-first-coin' }]);
  });

  it('keeps controls usable for this visit when storage is blocked', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    render(<App />);
    // Nothing remembers an answer, so the visit counts as a first one.
    expect(startQuestion()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Just let me play/ }));
    expect(startQuestion()).toBeNull();
    expect(collapsed()).toBe(true);
    fireEvent.click(rail().getByRole('button', { name: 'Expand mission rail' }));
    expect(collapsed()).toBe(false);
    await course();
    fireEvent.click(rail().getByRole('button', { name: 'Collapse mission rail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hash lab', exact: true }));
    expect(await screen.findByText('Free hash lab', {}, LOAD)).toBeTruthy();
    expect(startQuestion()).toBeNull();
  });
});
