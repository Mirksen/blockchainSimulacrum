// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { initialProgress, MISSIONS, STORAGE_KEY } from '../lib/missions';
import { START_KEY } from '../lib/startChoice';

// The first-visit question and the Basics view in the real App, with the real top bar,
// mission rail and start question. The simulator runs on a test session (as in
// AppMissions.test.jsx); the workbench, the labs, the pool and the course host are stand-ins.
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
vi.mock('../components/workbench/Workbench', () => ({ Workbench: () => <div data-testid="workbench">Workbench view</div> }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => <div data-testid="ticker" /> }));
vi.mock('../components/HashLab', () => ({ HashLab: ({ lesson }) => <section aria-label="Hash experiment">{lesson ?? 'Free hash lab'}</section> }));
vi.mock('../components/PoolPanel', () => ({ PoolPanel: ({ profile }) => <section aria-label="Leaderboard view">{profile ?? 'Board'}</section> }));
// The course host is built elsewhere: record every prop App hands it.
const course = vi.hoisted(() => ({ props: null }));
vi.mock('../components/basics/BasicsCourse', () => ({ BasicsCourse: props => {
  course.props = props;
  return <section aria-label="Basics course">{props.coach?.target ?? 'No coach'}</section>;
} }));

const RAIL = 'proofofwork-rail-collapsed';
const SEEN = 'proofofwork-missions-intro-seen';
const BASICS = MISSIONS.filter(mission => mission.chapter === 'basics').map(mission => mission.id);
const LOAD = { timeout: 30000 };
const startQuestion = () => screen.queryByRole('region', { name: 'Where do you want to start?' });
const main = () => screen.getByRole('main');
const rail = () => within(document.querySelector('.wb-rail'));
const collapsed = () => document.querySelector('.app-shell').classList.contains('is-rail-collapsed');
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));
const findCourse = () => screen.findByRole('region', { name: 'Basics course' }, LOAD);
const choose = title => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }));

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  course.props = null;
  vi.stubGlobal('requestAnimationFrame', callback => callback());
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('first visit', () => {
  it('asks where to start, without rewriting the address, the ticker or a stored answer', () => {
    render(<App />);
    expect(startQuestion()).toBeTruthy();
    expect(main().getAttribute('aria-label')).toBe('Start');
    expect(location.hash).toBe('');
    expect(screen.queryByTestId('ticker')).toBeNull();
    expect(screen.queryByTestId('workbench')).toBeNull();
    expect(screen.queryByText('current')).toBeNull();
    expect(collapsed()).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(localStorage.getItem(START_KEY)).toBeNull();
    // The earlier invitation and its flag are gone.
    expect(screen.queryByRole('region', { name: 'Curious? Try a mission.' })).toBeNull();
    expect(localStorage.getItem(SEEN)).toBeNull();
  });

  it('"Hashes are new to me" opens the first scene of the course in plain words', async () => {
    render(<App />);
    choose('Hashes are new to me');
    expect(localStorage.getItem(START_KEY)).toBe('new');
    expect(collapsed()).toBe(false);
    expect(localStorage.getItem(RAIL)).toBe('0');
    await findCourse();
    expect(location.hash).toBe('#/basics');
    expect(main().getAttribute('aria-label')).toBe('Basics');
    expect(startQuestion()).toBeNull();
    expect(screen.queryByTestId('ticker')).toBeNull();
    expect(course.props).toMatchObject({ tone: 'plain', coach: { mission: 'copy-problem', view: 'basics', target: 'basics.copy-photo' } });
    expect(course.props.progress).toMatchObject({ completed: [], skipped: [], step: 0 });
    expect(typeof course.props.onLessonEvent).toBe('function');
    expect(typeof course.props.onContinue).toBe('function');
    expect(typeof course.props.onClose).toBe('function');
    expect(stored().skipped).toEqual([]);
    // The rail speaks in the same tone.
    expect(rail().getByText(MISSIONS[0].hint.plain)).toBeTruthy();
  });

  it('"I know what a hash is" skips the fingerprint scenes and keeps the technical texts', async () => {
    render(<App />);
    choose('I know what a hash is');
    expect(localStorage.getItem(START_KEY)).toBe('hash');
    expect(collapsed()).toBe(false);
    await findCourse();
    expect(location.hash).toBe('#/basics');
    expect(stored().skipped).toEqual(['see-a-fingerprint', 'change-one-letter']);
    expect(course.props.tone).toBe('technical');
    expect(course.props.progress.skipped).toEqual(['see-a-fingerprint', 'change-one-letter']);
    expect(course.props.coach.target).toBe('basics.copy-photo');
    expect(rail().getByText('Mission 2 · skipped')).toBeTruthy();
    expect(rail().getByText('Mission 3 · skipped')).toBeTruthy();
    expect(rail().getByText(MISSIONS[0].hint.technical)).toBeTruthy();
  });

  it('"Just let me play" opens the workbench in free play', () => {
    render(<App />);
    choose('Just let me play');
    expect(localStorage.getItem(START_KEY)).toBe('play');
    expect(location.hash).toBe('#/');
    expect(screen.getByTestId('workbench')).toBeTruthy();
    expect(screen.getByTestId('ticker')).toBeTruthy();
    expect(startQuestion()).toBeNull();
    expect(collapsed()).toBe(true);
    expect(stored().skipped).toEqual([]);
    expect(course.props).toBeNull();
  });

  it('remembers the answer after reload', () => {
    render(<App />);
    choose('Just let me play');
    cleanup();
    history.replaceState(null, '', '/');
    render(<App />);
    expect(startQuestion()).toBeNull();
    expect(screen.getByTestId('workbench')).toBeTruthy();
  });

  it.each(['#/hash-lab', '#/pool/test-miner', '#/basics'])('opens the deep link %s instead of the question', async hash => {
    history.replaceState(null, '', `/${hash}`);
    render(<App />);
    expect(startQuestion()).toBeNull();
    if (hash === '#/hash-lab') expect(await screen.findByText('Free hash lab', {}, LOAD)).toBeTruthy();
    if (hash === '#/pool/test-miner') expect(await screen.findByText('test-miner', {}, LOAD)).toBeTruthy();
    if (hash === '#/basics') await findCourse();
    expect(location.hash).toBe(hash);
  });
});

describe('returning visitors land on the workbench', () => {
  it('who saw the earlier invitation', () => {
    localStorage.setItem(SEEN, '1');
    render(<App />);
    expect(startQuestion()).toBeNull();
    expect(screen.getByTestId('workbench')).toBeTruthy();
    expect(screen.getByTestId('ticker')).toBeTruthy();
  });

  it.each([
    ['a completed mission', { completed: ['copy-problem'] }],
    ['a skipped mission', { skipped: ['see-a-fingerprint'] }]
  ])('with %s', (name, change) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialProgress(), ...change }));
    render(<App />);
    expect(startQuestion()).toBeNull();
    expect(screen.getByTestId('workbench')).toBeTruthy();
  });

  it.each(['new', 'hash', 'play'])('who answered %s before', choice => {
    localStorage.setItem(START_KEY, choice);
    render(<App />);
    expect(startQuestion()).toBeNull();
    expect(screen.getByTestId('workbench')).toBeTruthy();
  });
});

describe('Starting point', () => {
  it('reopens the question from the menu, marks the current answer and applies a new one', async () => {
    localStorage.setItem(START_KEY, 'play');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starting point' }));
    expect(startQuestion()).toBeTruthy();
    expect(location.hash).toBe('#/start');
    expect(main().getAttribute('aria-label')).toBe('Start');
    expect(screen.queryByTestId('ticker')).toBeNull();
    const current = screen.getByRole('button', { name: /^Just let me play/ });
    expect(within(current).getByText('current')).toBeTruthy();
    expect(screen.getAllByText('current')).toHaveLength(1);
    choose('Hashes are new to me');
    expect(localStorage.getItem(START_KEY)).toBe('new');
    await findCourse();
    expect(course.props.tone).toBe('plain');
    expect(location.hash).toBe('#/basics');
  });

  it('is reachable through its address', () => {
    localStorage.setItem(START_KEY, 'hash');
    history.replaceState(null, '', '/#/start');
    render(<App />);
    expect(startQuestion()).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^I know what a hash is/ })).getByText('current')).toBeTruthy();
  });
});

describe('the Basics view', () => {
  it('opens from the Basics tab and hands the course no guidance while the rail is collapsed', async () => {
    localStorage.setItem(START_KEY, 'play');
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'Basics' }));
    await findCourse();
    expect(location.hash).toBe('#/basics');
    expect(screen.queryByTestId('ticker')).toBeNull();
    expect(course.props.coach).toBeNull();
    expect(course.props.onLessonEvent).toBeUndefined();
    // The course speaks in pictures to everyone but a visitor who said they know hashes.
    expect(course.props.tone).toBe('plain');
    expect(screen.getByText('No coach')).toBeTruthy();
  });

  it('reports lesson evidence into the missions while guided', async () => {
    localStorage.setItem(START_KEY, 'new');
    localStorage.setItem(RAIL, '0');
    history.replaceState(null, '', '/#/basics');
    render(<App />);
    await findCourse();
    act(() => ['photo', 'double-spend', 'rejected'].forEach(kind => course.props.onLessonEvent({ type: 'copy_tried', kind })));
    expect(stored().completed).toEqual(['copy-problem']);
    expect(course.props.progress.completed).toEqual(['copy-problem']);
    expect(course.props.coach).toMatchObject({ mission: 'see-a-fingerprint', target: 'basics.text' });
  });

  it('continues to the next scene, then to the lab step after the course', async () => {
    localStorage.setItem(START_KEY, 'new');
    localStorage.setItem(RAIL, '0');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialProgress(), completed: BASICS.slice(0, -1) }));
    history.replaceState(null, '', '/#/basics');
    render(<App />);
    await findCourse();
    expect(course.props.coach.mission).toBe('sealed-pages');
    act(() => course.props.onContinue());
    expect(location.hash).toBe('#/basics');
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialProgress(), completed: BASICS }));
    render(<App />);
    await findCourse();
    act(() => course.props.onContinue());
    expect(location.hash).toBe('#/hash-lab');
    expect(await screen.findByText('work', {}, LOAD)).toBeTruthy();
  });

  it('continues to the workbench when no mission is left, and closes to the workbench', async () => {
    localStorage.setItem(START_KEY, 'new');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialProgress(), completed: MISSIONS.map(mission => mission.id) }));
    history.replaceState(null, '', '/#/basics');
    render(<App />);
    await findCourse();
    act(() => course.props.onContinue());
    expect(location.hash).toBe('#/');
    expect(screen.getByTestId('workbench')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Basics' }));
    await findCourse();
    act(() => course.props.onClose());
    expect(location.hash).toBe('#/');
    expect(screen.getByTestId('workbench')).toBeTruthy();
  });
});

describe('opening the missions', () => {
  it('goes to the course while the active mission is a Basics scene', async () => {
    localStorage.setItem(START_KEY, 'play');
    render(<App />);
    fireEvent.click(rail().getByRole('button', { name: 'Expand mission rail' }));
    await findCourse();
    expect(location.hash).toBe('#/basics');
    expect(course.props.coach.target).toBe('basics.copy-photo');
  });

  it('stays on the current view once the course is behind the learner', () => {
    localStorage.setItem(START_KEY, 'play');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialProgress(), completed: BASICS }));
    render(<App />);
    fireEvent.click(rail().getByRole('button', { name: 'Expand mission rail' }));
    expect(collapsed()).toBe(false);
    expect(location.hash).toBe('');
    expect(screen.getByTestId('workbench')).toBeTruthy();
  });
});
