// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HashLab } from '../components/HashLab';
import App from '../App';
import { createTrial } from '../lib/hashLab';
import { STORAGE_KEY } from '../lib/missions';

vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => null }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  history.replaceState(null, '', '/');
});

const comparison = () => screen.getByRole('region', { name: 'Proof-of-work search comparison' });
const row = target => within(comparison()).getByRole('row', { name: new RegExp(`^${target} `) });
async function find(target) {
  fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: String(target) } });
  fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
  await act(async () => { await vi.runAllTimersAsync(); });
}

describe('measured work-lesson comparison', () => {
  it('retains the first result while the second search runs and records exact successful trials', async () => {
    vi.useFakeTimers();
    render(<HashLab lesson="work" />);
    await find(1);
    const one = Number(screen.getByLabelText(/Nonce/).value);
    expect(within(row('One zero')).getAllByRole('cell')[0].textContent).toBe((one + 1).toLocaleString());
    expect(row('One zero').textContent).toContain(createTrial('Hello, block!', one, 1).hash);
    fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    expect(row('One zero').textContent).toContain(createTrial('Hello, block!', one, 1).hash);
    expect(row('Two zeros').textContent).toContain('Not found yet');
    await act(async () => { await vi.runAllTimersAsync(); });
    const two = Number(screen.getByLabelText(/Nonce/).value);
    expect(within(row('Two zeros')).getAllByRole('cell')[0].textContent).toBe((two + 1).toLocaleString());
    expect(row('Two zeros').textContent).toContain(createTrial('Hello, block!', two, 2).hash);
    expect(comparison().textContent).toContain('Hello, block!');
    expect(comparison().textContent).toContain('nonce 0');
    expect(comparison().textContent).toContain('does not guarantee');
  });

  it('keeps real prior success on Stop, but clears it on Reset and ignores late work', async () => {
    vi.useFakeTimers();
    const onLessonEvent = vi.fn();
    const onWorkComparison = vi.fn();
    render(<HashLab lesson="work" onLessonEvent={onLessonEvent} onWorkComparison={onWorkComparison} />);
    await find(1);
    onLessonEvent.mockClear();
    fireEvent.change(screen.getByLabelText('Find a hash starting with'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop search' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(row('One zero').textContent).not.toContain('Not found yet');
    expect(row('Two zeros').textContent).toContain('Not found yet');
    expect(onLessonEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Find a nonce' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset lab' }));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.queryByRole('region', { name: 'Proof-of-work search comparison' })).toBeNull();
    expect(onWorkComparison).toHaveBeenLastCalledWith(null);
    expect(onLessonEvent.mock.calls.map(([event]) => event.type)).toEqual(['lesson_reset']);
  });

  it('survives the real App mission-completion remount, then Reset clears the recap', async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, completed: ['change-fingerprint'], step: 0, data: {} }));
    // The rail starts collapsed (free play); the lab lesson needs it open.
    localStorage.setItem('proofofwork-rail-collapsed', '0');
    history.replaceState(null, '', '/#/hash-lab');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Same message. A stricter target.' })).toBeTruthy();
    await find(1);
    const first = row('One zero').textContent;
    await find(2);
    // The next mission is on the workbench; App now mounts the free-play lab.
    expect(screen.getByRole('button', { name: 'Back to simulator' })).toBeTruthy();
    expect(row('One zero').textContent).toBe(first);
    expect(row('Two zeros').textContent).not.toContain('Not found yet');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).completed).toEqual(['change-fingerprint', 'earn-proof-of-work']);
    const results = comparison().textContent;
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A different free-play message' } });
    await find(1);
    expect(comparison().textContent).toBe(results);
    fireEvent.click(screen.getByRole('button', { name: 'Reset lab' }));
    expect(screen.queryByRole('region', { name: 'Proof-of-work search comparison' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Chain lab' }));
    fireEvent.click(screen.getByRole('link', { name: 'Hash lab' }));
    expect(screen.queryByRole('region', { name: 'Proof-of-work search comparison' })).toBeNull();
  });
});
