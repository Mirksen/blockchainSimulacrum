// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardTicker, TICKER_REFRESH_MS } from '../components/workbench/LeaderboardTicker';
import { getLeaderboard } from '../lib/poolApi';

vi.mock('../lib/poolApi', async importOriginal => ({ ...(await importOriginal()), getLeaderboard: vi.fn() }));

const ROWS = [
  { name: 'test-miner-a', points: 65536, shares: 1, bestHash: '0000ab'.padEnd(62, 'c') + 'ef', bestZeros: 4 },
  { name: 'test-miner-b', points: 4096, shares: 2, bestHash: '000f12'.padEnd(62, 'd') + '9a', bestZeros: 3 },
];
const flush = () => act(async () => {});
const ticker = () => screen.queryByTestId('leaderboard-ticker');
const stubMotion = reduce => vi.stubGlobal('matchMedia', query => ({
  matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query,
  addEventListener() {}, removeEventListener() {},
}));

beforeEach(() => { vi.mocked(getLeaderboard).mockReset(); stubMotion(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('LeaderboardTicker', () => {
  it('shows rank, name, points and the short best hash, and opens the pool on click', async () => {
    vi.mocked(getLeaderboard).mockResolvedValue(ROWS);
    const onOpenPool = vi.fn();
    render(<LeaderboardTicker onOpenPool={onOpenPool} />);
    await flush();
    const band = ticker();
    expect(band).toBeTruthy();
    const list = band.querySelector('.leaderboard-ticker-list:not([aria-hidden])');
    const first = list.querySelector('.leaderboard-ticker-row');
    expect(first.textContent).toBe('#1test-miner-a65,536 pts0000ab…ef');
    expect(first.querySelector('.leaderboard-ticker-zero').textContent).toBe('0000');
    expect(list.querySelectorAll('.leaderboard-ticker-row')[1].textContent).toContain('#2test-miner-b4,096 pts000f12…9a');
    // The second copy only makes the loop seamless; assistive tech hears one list.
    expect(band.querySelectorAll('.leaderboard-ticker-list[aria-hidden="true"]')).toHaveLength(1);

    const button = screen.getByRole('button', { name: /^Pool leaderboard, 2 miners, leader test-miner-a with 65,536 points/ });
    fireEvent.click(button);
    expect(onOpenPool).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the server is unavailable', async () => {
    vi.mocked(getLeaderboard).mockRejectedValue(Object.assign(new Error('The leaderboard server could not be reached.'), { status: 0 }));
    const { container } = render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an empty board', async () => {
    vi.mocked(getLeaderboard).mockResolvedValue([]);
    const { container } = render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    expect(container.innerHTML).toBe('');
  });

  it('pauses on hover and focus and resumes after', async () => {
    vi.mocked(getLeaderboard).mockResolvedValue(ROWS);
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
    vi.mocked(getLeaderboard).mockResolvedValue(ROWS);
    render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    expect(ticker().classList.contains('is-static')).toBe(true);
    expect(ticker().querySelectorAll('.leaderboard-ticker-list')).toHaveLength(1);
  });

  it('refreshes every 60 s and hides quietly when a refresh fails', async () => {
    vi.useFakeTimers();
    vi.mocked(getLeaderboard).mockResolvedValueOnce(ROWS).mockResolvedValueOnce([ROWS[1]])
      .mockRejectedValueOnce(Object.assign(new Error('The leaderboard server is unavailable right now.'), { status: 503 }));
    render(<LeaderboardTicker onOpenPool={() => {}} />);
    await flush();
    expect(getLeaderboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/2 miners/);

    await act(async () => { await vi.advanceTimersByTimeAsync(TICKER_REFRESH_MS - 1); });
    expect(getLeaderboard).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/1 miner, leader test-miner-b/);

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
