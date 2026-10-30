// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { initialProgress, MISSIONS, STORAGE_KEY } from '../lib/missions';

// Keep real App, rail, invitation and progress storage. Simulation and lab internals
// are covered separately; their evidence callbacks exercise the real App wiring here.
vi.mock('../hooks/useBlockchain', () => ({ useBlockchain: () => ({
  blocks: [{}], participants: [], balances: [], memPool: [], chainValid: true,
  isMining: false, isSettingUp: false, difficulty: 2, halvingInterval: 4,
}) }));
vi.mock('../components/workbench/Workbench', () => ({ Workbench: ({ coach }) =>
  <div data-testid="workbench-coach">{coach?.target ?? 'Free play'}</div> }));
vi.mock('../components/workbench/TopBar', () => ({ TopBar: ({ onNavigate }) =>
  <nav><button onClick={() => onNavigate('hash-lab')}>Hash lab</button>
    <button onClick={() => onNavigate('workbench')}>Workbench</button></nav> }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => null }));
vi.mock('../components/HashLab', () => ({ HashLab: ({ lesson, coach, onLessonEvent }) =>
  <section aria-label="Hash experiment">
    <span>{lesson ?? 'Free hash lab'}</span><span>{coach?.target ?? 'No coach'}</span>
    <button onClick={() => onLessonEvent?.({ type: 'hash_changed' })}>Change message</button>
  </section> }));

const RAIL = 'proofofwork-rail-collapsed';
const SEEN = 'proofofwork-missions-intro-seen';
const intro = () => screen.queryByRole('region', { name: 'Curious? Try a mission.' });
const rail = () => within(document.querySelector('.wb-rail'));
const mobile = () => within(document.querySelector('.wb-mbar'));
const collapsed = () => document.querySelector('.app-shell').classList.contains('is-rail-collapsed');
const reload = () => { cleanup(); render(<App />); };

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.stubGlobal('requestAnimationFrame', callback => callback());
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('optional missions in App', () => {
  it('starts in free play everywhere and never repeats an ignored invitation after reload', () => {
    render(<App />);
    expect(collapsed()).toBe(true);
    expect(intro()).toBeTruthy();
    expect(localStorage.getItem(SEEN)).toBe('1');
    expect(screen.getByTestId('workbench-coach').textContent).toBe('Free play');
    expect(mobile().getByRole('button', { name: 'Open missions' }).textContent).toBe('Missions');
    expect(document.activeElement).toBe(document.body);
    reload();
    expect(intro()).toBeNull();
    expect(collapsed()).toBe(true);
  });

  it('remembers dismissal, while the page and free labs stay usable', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: "Don't show again" }));
    expect(intro()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hash lab', exact: true }));
    expect(screen.getByText('Free hash lab')).toBeTruthy();
    expect(screen.getByText('No coach')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change message' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed).toEqual([]);
    reload();
    expect(intro()).toBeNull();
    expect(collapsed()).toBe(true);
  });

  it('remembers explicit expansion and collapse without losing completed missions', () => {
    const progress = { ...initialProgress(), completed: [MISSIONS[0].id] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    render(<App />);
    expect(intro()).toBeNull();
    fireEvent.click(rail().getByRole('button', { name: 'Expand mission rail' }));
    expect(localStorage.getItem(RAIL)).toBe('0');
    reload();
    expect(collapsed()).toBe(false);
    expect(document.querySelector('.wb-rail .mission-rail-xp').textContent).toBe('20 XP0 badges1 of 9 done');
    fireEvent.click(rail().getByRole('button', { name: 'Show me' }));
    expect(screen.getByText('work')).toBeTruthy();
    expect(screen.getByText('hash-lab.search')).toBeTruthy();
    fireEvent.click(rail().getByRole('button', { name: 'Collapse mission rail' }));
    expect(screen.getByText('Free hash lab')).toBeTruthy();
    expect(screen.getByText('No coach')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual(progress);
    reload();
    expect(collapsed()).toBe(true);
    expect(localStorage.getItem(RAIL)).toBe('1');
  });

  it('starts missions voluntarily and preserves newly earned progress when hidden', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start missions' }));
    expect(intro()).toBeNull();
    expect(collapsed()).toBe(false);
    fireEvent.click(rail().getByRole('button', { name: 'Show me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change message' }));
    expect(document.querySelector('.wb-rail .mission-rail-xp').textContent).toBe('20 XP0 badges1 of 9 done');
    fireEvent.click(rail().getByRole('button', { name: 'Collapse mission rail' }));
    reload();
    expect(collapsed()).toBe(true);
    expect(intro()).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed).toEqual([MISSIONS[0].id]);
  });

  it('enables lessons from mobile access, then hides tasks and coaches using Hide missions', () => {
    render(<App />);
    fireEvent.click(mobile().getByRole('button', { name: 'Open missions' }));
    expect(collapsed()).toBe(false);
    const sheet = screen.getByRole('dialog', { name: 'Missions' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Show me' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('hash-lab.message')).toBeTruthy();
    fireEvent.click(mobile().getByRole('button', { name: 'Hide missions' }));
    expect(collapsed()).toBe(true);
    expect(screen.getByText('Free hash lab')).toBeTruthy();
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
    expect(intro()).toBeNull();
    expect(screen.getByTestId('workbench-coach').textContent).toBe('hash-lab.message');
  });

  it('keeps controls usable for this visit when storage is blocked', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    render(<App />);
    expect(collapsed()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: "Don't show again" }));
    fireEvent.click(rail().getByRole('button', { name: 'Expand mission rail' }));
    expect(collapsed()).toBe(false);
    fireEvent.click(rail().getByRole('button', { name: 'Collapse mission rail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hash lab', exact: true }));
    expect(screen.getByText('Free hash lab')).toBeTruthy();
    expect(intro()).toBeNull();
  });
});
