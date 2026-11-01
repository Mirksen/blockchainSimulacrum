// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardTicker, TICKER_REFRESH_MS } from '../components/workbench/LeaderboardTicker';
import { findsOf } from '../lib/poolProof';
import { getLeaderboard } from '../lib/poolApi';

vi.mock('../lib/poolApi', async importOriginal => ({ ...(await importOriginal()), getLeaderboard: vi.fn() }));

const ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };
const ROWS = [
  { name: 'test-miner-a', round: ROUND, header: '00'.repeat(80), coinbase: '00', branch: [], bestHash: '0000ab'.padEnd(62, 'c') + 'ef', bestZeros: 4,
    difficulty: 2.5e9, proofs: 3, foundAt: 1_800_000_000_000 },
  { name: 'test-miner-b', round: { height: 899990, hash: 'a'.repeat(64) }, header: '00'.repeat(80), coinbase: '00', branch: [], bestHash: '000f12'.padEnd(62, 'd') + '9a',
    bestZeros: 3, difficulty: 4096, proofs: 1, foundAt: 1_799_999_000_000 },
];
const ROUND_ROW = { ...ROWS[1], name: 'round-only-miner', round: ROUND };
// The ticker shows the all-time board; this round's rows are for the pool panel.
const board = (allTime, roundRows = [ROUND_ROW]) => ({ recent: { from: ROUND.height - 143, to: ROUND.height, rows: roundRows }, allTime });
const flush = () => act(async () => {});
const ticker = () => screen.queryByTestId('leaderboard-ticker');
const stubMotion = reduce => vi.stubGlobal('matchMedia', query => ({
  matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query,
  addEventListener() {}, removeEventListener() {},
}));

beforeEach(() => { vi.mocked(getLeaderboard).mockReset(); stubMotion(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('LeaderboardTicker', () => {
  it('shows rank, name, zeros, difficulty and the short best hash of all time, and opens the pool on click', async () => {
    vi.mocked(getLeaderboard).mockResolvedValue(board(ROWS));
    const onOpenPool = vi.fn();
    render(<LeaderboardTicker onOpenPool={onOpenPool} />);
    await flush();
    const band = ticker();
    expect(band).toBeTruthy();
    const list = band.querySelector('.leaderboard-ticker-list:not([aria-hidden])');
    const first = list.querySelector('.leaderboard-ticker-row');
    expect(first.textContent).toBe('#1test-miner-a4 zeros · 2.5 B0000ab…ef');
    expect(first.querySelector('.leaderboard-ticker-zero').textContent).toBe('0000');
    expect(list.querySelectorAll('.leaderboard-ticker-row')[1].textContent).toBe('#2test-miner-b3 zeros · 4,096000f12…9a');
    expect(band.querySelector('.leaderboard-ticker-row:not(.is-find) .leaderboard-ticker-name').textContent).toBe('test-miner-a');
    expect(band.querySelector('.leaderboard-ticker-list:not([aria-hidden]) .is-find').textContent).toBe('Best todayround-only-miner3 zeros');
    // The second copy only makes the loop seamless; assistive tech hears one list.
    expect(band.querySelectorAll('.leaderboard-ticker-list[aria-hidden="true"]')).toHaveLength(1);

    const button = screen.getByRole('button', { name: 'Leaderboard, 2 miners, leader test-miner-a with 4 zeros. Open the leaderboard' });
    fireEvent.click(button);
    expect(onOpenPool).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unavailable', { status: 0, code: 'network' }],
    ['answering with a malformed board', { status: 0, code: 'invalid' }],
  ])('renders nothing when the server is %s', async (_label, failure) => {
    vi.mocked(getLeaderboard).mockRejectedValue(Object.assign(new Error('Synthetic pool failure.'), failure));
    const { container } = render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    expect(container.innerHTML).toBe('');
  });

  it.each([
    ['an empty board', { round: null, allTime: [] }],
    ['a board with blocks only in this round', board([])],
  ])('invites to the first block on %s and still opens the leaderboard', async (_label, answer) => {
    vi.mocked(getLeaderboard).mockResolvedValue(answer);
    const onOpenPool = vi.fn();
    const onBoard = vi.fn();
    render(<LeaderboardTicker onOpenPool={onOpenPool} onBoard={onBoard} />);
    await flush();
    expect(ticker().textContent).toContain('No blocks yet. Mine the first one.');
    expect(onBoard).toHaveBeenCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: 'Leaderboard, no blocks yet. Open the leaderboard' }));
    expect(onOpenPool).toHaveBeenCalledTimes(1);
  });

  it('derives the special finds from what the board says', () => {
    const rows = [{ name: 'deep', bestZeros: 7, proofs: 2, foundAt: 10 }, { name: 'busy', bestZeros: 3, proofs: 900, foundAt: 20 },
      { name: 'new', bestZeros: 2, proofs: 1, foundAt: 30 }];
    expect(findsOf({ recent: { rows: [rows[1]] }, allTime: rows })).toEqual([
      { label: 'Best today', name: 'busy', value: '3 zeros' }, { label: 'Most blocks', name: 'busy', value: '900' },
      { label: 'Latest find', name: 'new', value: '2 zeros' }]);
    expect(findsOf({ recent: null, allTime: [] })).toEqual([]);
    expect(findsOf({ recent: { rows: [] }, allTime: [rows[2]] }).map(find => find.label)).toEqual(['Latest find']);
  });

  it('reads the board again when a block was accepted and hands the rows up', async () => {
    vi.mocked(getLeaderboard).mockResolvedValue(board(ROWS));
    const onBoard = vi.fn();
    const view = render(<LeaderboardTicker onBoard={onBoard} refreshKey={0} />);
    await flush();
    view.rerender(<LeaderboardTicker onBoard={onBoard} refreshKey={1} />);
    await flush();
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
    expect(onBoard).toHaveBeenLastCalledWith(ROWS);
  });

  it('pauses on hover and focus and resumes after', async () => {
    vi.mocked(getLeaderboard).mockResolvedValue(board(ROWS));
    render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    const button = screen.getByRole('button');
    expect(ticker().classList.contains('is-paused')).toBe(false);
    fireEvent.mouseEnter(button);
    expect(ticker().classList.contains('is-paused')).toBe(true);
    fireEvent.mouseLeave(button);
    expect(ticker().classList.contains('is-paused')).toBe(false);
    fireEvent.focus(button);
    expect(ticker().classList.contains('is-paused')).toBe(true);
    fireEvent.blur(button);
    expect(ticker().classList.contains('is-paused')).toBe(false);
  });

  it('is a static single list under prefers-reduced-motion', async () => {
    stubMotion(true);
    vi.mocked(getLeaderboard).mockResolvedValue(board(ROWS));
    render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    expect(ticker().classList.contains('is-static')).toBe(true);
    expect(ticker().querySelectorAll('.leaderboard-ticker-list')).toHaveLength(1);
  });

  it('refreshes every 60 s and hides quietly when a refresh fails', async () => {
    vi.useFakeTimers();
    vi.mocked(getLeaderboard).mockResolvedValueOnce(board(ROWS)).mockResolvedValueOnce(board([ROWS[1]]))
      .mockRejectedValueOnce(Object.assign(new Error('The leaderboard server is unavailable right now.'), { status: 503 }));
    render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    expect(getLeaderboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/2 miners/);

    await act(async () => { await vi.advanceTimersByTimeAsync(TICKER_REFRESH_MS - 1); });
    expect(getLeaderboard).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Leaderboard, 1 miner, leader test-miner-b with 3 zeros. Open the leaderboard');

    await act(async () => { await vi.advanceTimersByTimeAsync(TICKER_REFRESH_MS); });
    expect(getLeaderboard).toHaveBeenCalledTimes(3);
    expect(ticker()).toBeNull();
  });

  it('cancels the request and stops refreshing on unmount', async () => {
    vi.useFakeTimers();
    let signal;
    vi.mocked(getLeaderboard).mockImplementation(options => { signal = options.signal; return new Promise(() => {}); });
    const { unmount } = render(<LeaderboardTicker onOpenPool={() => {}} />);
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(TICKER_REFRESH_MS * 2); });
    expect(getLeaderboard).toHaveBeenCalledTimes(1);
  });
});
