// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolPanel } from '../components/PoolPanel';
import { getChallenge, getLeaderboard, submitShare } from '../lib/poolApi';

vi.mock('../lib/poolApi', async importOriginal => ({ ...(await importOriginal()),
  getChallenge: vi.fn(), submitShare: vi.fn(), getLeaderboard: vi.fn() }));

const NOW = Date.UTC(2026, 0, 1, 12);
const NAME = 'test-miner';
const UNAVAILABLE = 'The leaderboard server is unavailable right now. The simulator keeps working.';
const START_NONCE = Math.floor(0.25 * 2 ** 52);
const makeChallenge = (number, zeros = 1, expiresIn = 600_000) => {
  const id = number.toString(16).padStart(32, '0');
  return { id, name: NAME, zeros, expiresAt: NOW + expiresIn, sig: 'c'.repeat(64), prefix: `proofofwork.fyi|${id}|${NAME}|` };
};
const sha256 = text => createHash('sha256').update(text).digest('hex');
const httpError = status => Object.assign(new Error(`Synthetic HTTP ${status}.`), { status });
// Holds the loop at "connecting" until the panel aborts the request.
const parked = (_name, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
});
const accept = async (challenge, nonce) => ({ accepted: true, zeros: [...sha256(challenge.prefix + nonce)].findIndex(c => c !== '0'),
  points: 16 ** challenge.zeros });
const stat = label => screen.getByText(label, { selector: 'dt' }).nextElementSibling.textContent;
const status = () => screen.getByRole('status').textContent;
const settle = ms => act(() => new Promise(resolve => setTimeout(resolve, ms)));
const join = (name = NAME) => {
  fireEvent.change(screen.getByLabelText('Name on the leaderboard'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));
};

beforeEach(() => {
  // Freeze only the wall clock; the inline search still yields on real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  localStorage.clear();
  vi.mocked(getLeaderboard).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(getChallenge).mockReset();
  vi.mocked(submitShare).mockReset();
  vi.mocked(getLeaderboard).mockReset();
});

describe('PoolPanel', () => {
  it('submits a found share and shows the accepted share, points and leaderboard', async () => {
    const first = makeChallenge(1);
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockImplementation(parked);
    vi.mocked(submitShare).mockImplementation(accept);
    vi.mocked(getLeaderboard).mockResolvedValueOnce([])
      .mockResolvedValue([{ name: 'other-miner', points: 1234567, shares: 19, bestHash: '00000abcdef123456789', bestZeros: 5 },
        { name: NAME, points: 16, shares: 1, bestHash: '0fedcba9876543210', bestZeros: 1 }]);
    render(<PoolPanel onClose={() => {}} />);
    await screen.findByText('No shares yet. Join to find the first one.');
    join();
    await waitFor(() => expect(submitShare).toHaveBeenCalledTimes(1));
    const [challenge, nonce] = vi.mocked(submitShare).mock.calls[0];
    expect(challenge).toBe(first);
    expect(nonce).toBeGreaterThanOrEqual(START_NONCE);
    expect(sha256(first.prefix + nonce).startsWith('0')).toBe(true);
    await waitFor(() => expect(stat('Accepted shares')).toBe('1'));
    expect(stat('Points this visit')).toBe('16');
    expect(stat('Attempts this target')).toBe((nonce - START_NONCE + 1).toLocaleString('en-US'));
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getAllByRole('cell').map(cell => cell.textContent))
      .toEqual(['1', 'other-miner', '1,234,567', '19', '00000abcdef1 5 zeros']);
    expect(within(rows[2]).getAllByRole('cell').map(cell => cell.textContent))
      .toEqual(['2', NAME, '16', '1', '0fedcba98765 1 zero']);
    expect(getChallenge).toHaveBeenCalledWith(NAME, expect.anything());
    expect(localStorage.getItem('proofofwork-pool-name')).toBe(NAME);
  });

  it('Stop ends the loop: a later target is neither searched nor submitted', async () => {
    let release;
    vi.mocked(getChallenge).mockResolvedValueOnce(makeChallenge(1))
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockImplementation(parked);
    vi.mocked(submitShare).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(2));
    expect(stat('Accepted shares')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(status()).toBe('Stopped. Accepted shares stay on the leaderboard.');
    await act(async () => release(makeChallenge(2)));
    await settle(300);
    expect(submitShare).toHaveBeenCalledTimes(1);
    expect(getChallenge).toHaveBeenCalledTimes(2);
    expect(stat('Accepted shares')).toBe('1');
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
    expect(status()).toBe('Stopped. Accepted shares stay on the leaderboard.');
  });

  it.each([410, 409])('fetches a new target after a %i answer', async code => {
    const first = makeChallenge(1);
    const second = makeChallenge(2);
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockImplementation(parked);
    vi.mocked(submitShare).mockRejectedValueOnce(httpError(code)).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(submitShare).toHaveBeenCalledTimes(2));
    expect(vi.mocked(submitShare).mock.calls.map(([challenge]) => challenge)).toEqual([first, second]);
    await waitFor(() => expect(stat('Accepted shares')).toBe('1'));
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(3));
    expect(status()).toBe('Asking the pool for a target…');
  });

  it('abandons a target five seconds before it expires and continues with a new one', async () => {
    // Eight zeros cannot be met by this fixed start nonce within the 30 ms left.
    const expiring = makeChallenge(1, 8, 5030);
    const next = makeChallenge(2);
    vi.mocked(getChallenge).mockResolvedValueOnce(expiring).mockResolvedValueOnce(next).mockImplementation(parked);
    vi.mocked(submitShare).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(submitShare).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitShare).mock.calls[0][0]).toBe(next);
    await waitFor(() => expect(stat('Accepted shares')).toBe('1'));
  });

  it('keeps searching when a target looks expired on arrival because the visitor clock runs ahead', async () => {
    const skewed = makeChallenge(1, 1, -60_000);
    vi.mocked(getChallenge).mockResolvedValueOnce(skewed).mockImplementation(parked);
    vi.mocked(submitShare).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(submitShare).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitShare).mock.calls[0][0]).toBe(skewed);
  });

  it('shows the unavailable state when the server is down and stops mining on 5xx or 429', async () => {
    vi.mocked(getLeaderboard).mockRejectedValue(Object.assign(new Error('unreachable'), { status: 0 }));
    render(<PoolPanel onClose={() => {}} />);
    await waitFor(() => expect(status()).toBe(UNAVAILABLE));
    expect(screen.getAllByText(UNAVAILABLE)).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
    for (const code of [503, 429]) {
      vi.mocked(getChallenge).mockRejectedValueOnce(httpError(code));
      join();
      await waitFor(() => expect(status()).toBe(UNAVAILABLE));
      expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
    }
    expect(getChallenge).toHaveBeenCalledTimes(2);
    expect(submitShare).not.toHaveBeenCalled();
  });

  it('blocks Join for an invalid name and explains the rule', async () => {
    render(<PoolPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByRole('alert').textContent).toBe('Use 3–20 characters: letters, digits or hyphens.');
    for (const name of ['ab', 'bad name!', 'under_score']) {
      join(name);
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByLabelText('Name on the leaderboard').getAttribute('aria-invalid')).toBe('true');
    }
    await settle(20);
    expect(getChallenge).not.toHaveBeenCalled();
    expect(localStorage.getItem('proofofwork-pool-name')).toBeNull();
    fireEvent.change(screen.getByLabelText('Name on the leaderboard'), { target: { value: 'fine-name' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('remembers a valid name and survives blocked storage', () => {
    localStorage.setItem('proofofwork-pool-name', 'stored-miner');
    const view = render(<PoolPanel onClose={() => {}} />);
    expect(screen.getByLabelText('Name on the leaderboard').value).toBe('stored-miner');
    view.unmount();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.mocked(getChallenge).mockImplementation(parked);
    render(<PoolPanel onClose={() => {}} />);
    expect(screen.getByLabelText('Name on the leaderboard').value).toBe('');
    join();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
  });

  it.each(['close', 'unmount'])('stops mining on %s', async action => {
    vi.mocked(getChallenge).mockImplementation(parked);
    const onClose = vi.fn();
    const view = render(<PoolPanel onClose={onClose} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(1));
    const { signal } = vi.mocked(getChallenge).mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    if (action === 'close') {
      fireEvent.click(screen.getByRole('button', { name: 'Back to simulator' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    } else view.unmount();
    expect(signal.aborted).toBe(true);
    await settle(20);
    expect(getChallenge).toHaveBeenCalledTimes(1);
  });
});
