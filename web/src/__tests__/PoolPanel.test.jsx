// @vitest-environment jsdom
import SHA256 from 'crypto-js/sha256';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolPanel, ROUND_CHECK_MS } from '../components/PoolPanel';
import { getChallenge, getLeaderboard, submitProof } from '../lib/poolApi';
import { formatDifficulty, GENESIS, hashDifficulty, leadingZeros, proofPrefix } from '../lib/poolProof';
import { runSearch } from '../lib/powSearch';

vi.mock('../lib/poolApi', async importOriginal => ({ ...(await importOriginal()),
  getChallenge: vi.fn(), submitProof: vi.fn(), getLeaderboard: vi.fn() }));
// The real inline search by default; one test replaces it to drive the round check.
vi.mock('../lib/powSearch', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, runSearch: vi.fn(actual.runSearch) };
});

const NAME = 'test-miner';
const UNAVAILABLE = 'The leaderboard server is unavailable right now. The simulator keeps working.';
const START_NONCE = Math.floor(0.25 * 2 ** 52);
const EMPTY = { round: null, allTime: [] };
const sha256 = text => SHA256(text).toString();
// Synthetic Bitcoin rounds: the hash is the height in hex, so every height is a distinct round.
const roundOf = height => ({ height, hash: height.toString(16).padStart(64, '0') });
const makeChallenge = (round, minZeros = 1, name = NAME) => ({ name, round, prefix: proofPrefix(GENESIS.hash, round, name),
  minZeros, genesisHash: GENESIS.hash });
// The proofs an honest search finds, in order, from a start nonce.
function proofsFrom(challenge, count, start = START_NONCE) {
  const target = '0'.repeat(challenge.minZeros);
  const found = [];
  for (let nonce = start; found.length < count; nonce++) {
    const hash = sha256(challenge.prefix + nonce);
    if (hash.startsWith(target)) found.push({ nonce, hash });
  }
  return found;
}
// The first synthetic round from `height` on whose proofs satisfy `wanted`; deterministic for a fixed genesis.
function findChallenge(height, count, wanted) {
  for (let candidate = height; ; candidate++) {
    const challenge = makeChallenge(roundOf(candidate));
    const proofs = proofsFrom(challenge, count);
    if (wanted(proofs)) return { challenge, proofs };
  }
}
const httpError = status => Object.assign(new Error(`Synthetic HTTP ${status}.`), { status });
// Holds the loop at "connecting" until the panel aborts the request.
const parked = (_name, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
});
const accept = async (challenge, nonce) => {
  const hash = sha256(challenge.prefix + nonce);
  return { accepted: true, hash, zeros: leadingZeros(hash), difficulty: hashDifficulty(hash), round: challenge.round };
};
const best = hash => `${leadingZeros(hash)} · ${formatDifficulty(hashDifficulty(hash))}`;
const stat = label => screen.getByText(label, { selector: 'dt' }).nextElementSibling.textContent;
const status = () => screen.getAllByRole('status')[0].textContent;
const settle = ms => act(() => new Promise(resolve => setTimeout(resolve, ms)));
// The board section and its scrollable table share one heading; the section holds both.
const region = name => screen.getAllByRole('region', { name })[0];
const findRegion = async name => (await screen.findAllByRole('region', { name }))[0];
const submitted = () => vi.mocked(submitProof).mock.calls.map(([challenge, nonce]) => [challenge, nonce]);
const cells = row => within(row).getAllByRole('cell').map(cell => cell.textContent);
const join = (name = NAME) => {
  fireEvent.change(screen.getByLabelText('Name on the leaderboard'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));
};

beforeEach(async () => {
  vi.mocked(runSearch).mockImplementation((await vi.importActual('../lib/powSearch')).runSearch);
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  localStorage.clear();
  vi.mocked(getLeaderboard).mockResolvedValue(EMPTY);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(getChallenge).mockReset();
  vi.mocked(submitProof).mockReset();
  vi.mocked(getLeaderboard).mockReset();
  vi.mocked(runSearch).mockReset();
});

describe('PoolPanel', () => {
  it('submits a found proof and shows this round and all time', async () => {
    const round = roundOf(900001);
    const first = makeChallenge(round);
    const [proof] = proofsFrom(first, 1);
    const leader = { name: 'other-miner', round: roundOf(899990), nonce: 77, bestHash: `0000000abcdef${'1'.repeat(51)}`,
      bestZeros: 7, difficulty: 2.5e9, proofs: 1234, foundAt: 1_800_000_000_000 };
    const mine = { name: NAME, round, nonce: proof.nonce, bestHash: proof.hash, bestZeros: leadingZeros(proof.hash),
      difficulty: 16, proofs: 1, foundAt: 1_800_000_100_000 };
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    vi.mocked(getLeaderboard).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce({ round: { ...round, rows: [] }, allTime: [leader] })
      .mockResolvedValue({ round: { ...round, rows: [mine] }, allTime: [leader, mine] });
    render(<PoolPanel onClose={() => {}} />);
    await screen.findByText('No proofs in this round yet. Join to find the first one.');
    expect(screen.getByText('No proofs yet.')).toBeTruthy();
    join();
    await waitFor(() => expect(submitProof).toHaveBeenCalledTimes(1));
    expect(getChallenge).toHaveBeenCalledWith(NAME, expect.anything());
    const search = vi.mocked(runSearch).mock.calls[0][0];
    expect(search.target).toBe('0');
    expect(search.entrants).toEqual([{ id: 'you', weight: 1, prefix: first.prefix, suffix: '', startNonce: START_NONCE }]);
    const [challenge, nonce] = vi.mocked(submitProof).mock.calls[0];
    expect(challenge).toBe(first);
    expect(nonce).toBe(proof.nonce);
    expect(sha256(`proofofwork.fyi|${GENESIS.hash}|900001:${round.hash}|${NAME}|${nonce}`)).toBe(proof.hash);
    await waitFor(() => expect(stat('Accepted proofs')).toBe('1'));
    expect(stat('Your best this round')).toBe(best(proof.hash));
    expect(stat('Round')).toBe('#900001');
    expect(localStorage.getItem('proofofwork-pool-name')).toBe(NAME);

    const thisRound = await findRegion('This round · Bitcoin block #900001');
    expect(within(thisRound).getAllByRole('columnheader').map(cell => cell.textContent))
      .toEqual(['Rank', 'Name', 'Best hash', 'Zeros', 'Difficulty', 'Proofs', 'Check']);
    const roundRows = within(thisRound).getAllByRole('row');
    expect(roundRows).toHaveLength(2);
    expect(cells(roundRows[1])).toEqual(['1', NAME, `${proof.hash.slice(0, 12)}…`, String(mine.bestZeros), '16', '1', 'Verify']);
    const allTimeRows = within(region('All time · top 20')).getAllByRole('row');
    expect(allTimeRows).toHaveLength(3);
    expect(cells(allTimeRows[1])).toEqual(['1', 'other-miner', '0000000abcde…', '7', '2.5 B', '1,234', 'Verify']);
    expect(cells(allTimeRows[2])[1]).toBe(NAME);
    // Mount, round start and the accepted proof each read the board once.
    expect(getLeaderboard).toHaveBeenCalledTimes(3);
  });

  it('submits only a hash smaller than this round\'s best', async () => {
    // A round whose second proof is worse than the first and whose third is better.
    const { challenge, proofs } = findChallenge(900100, 3, ([a, b, c]) => b.hash > a.hash && c.hash < a.hash);
    vi.mocked(getChallenge).mockResolvedValueOnce(challenge).mockResolvedValueOnce(challenge).mockResolvedValueOnce(challenge)
      .mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(4));
    expect(vi.mocked(runSearch).mock.calls.map(([options]) => options.entrants[0].startNonce))
      .toEqual([START_NONCE, proofs[0].nonce + 1, proofs[1].nonce + 1]);
    expect(submitted()).toEqual([[challenge, proofs[0].nonce], [challenge, proofs[2].nonce]]);
    await waitFor(() => expect(stat('Accepted proofs')).toBe('2'));
    expect(stat('Your best this round')).toBe(best(proofs[2].hash));
    // The same round is not re-read; only accepted proofs refresh the board.
    expect(getLeaderboard).toHaveBeenCalledTimes(4);
  });

  it('starts over in a new round: fresh nonces, a fresh best and a refreshed board', async () => {
    const first = makeChallenge(roundOf(900200));
    const [firstProof] = proofsFrom(first, 1);
    // A next round whose first proof is worse than the old best, so only a reset best submits it.
    const { challenge: next, proofs: [nextProof] } = findChallenge(900201, 1, ([proof]) => proof.hash > firstProof.hash);
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockResolvedValueOnce(next).mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    const nextBoard = { round: { ...next.round, rows: [] }, allTime: [] };
    vi.mocked(getLeaderboard).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY)
      .mockResolvedValue(nextBoard);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(3));
    expect(vi.mocked(runSearch).mock.calls.map(([options]) => options.entrants[0]))
      .toMatchObject([{ prefix: first.prefix, startNonce: START_NONCE }, { prefix: next.prefix, startNonce: START_NONCE }]);
    expect(submitted()).toEqual([[first, firstProof.nonce], [next, nextProof.nonce]]);
    await waitFor(() => expect(stat('Accepted proofs')).toBe('2'));
    expect(stat('Round')).toBe(`#${next.round.height}`);
    expect(stat('Your best this round')).toBe(best(nextProof.hash));
    // Mount, round one, its proof, round two, its proof.
    expect(getLeaderboard).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('heading', { name: `This round · Bitcoin block #${next.round.height}` })).toBeTruthy();
  });

  it('asks for the round again after ROUND_CHECK_MS and keeps going in the same round', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const advance = ms => act(() => vi.advanceTimersByTimeAsync(ms));
    const challenge = makeChallenge(roundOf(900300), 6);
    vi.mocked(getChallenge).mockResolvedValueOnce(challenge).mockResolvedValueOnce(challenge).mockImplementation(parked);
    // A search that never finds a proof: it ends only when the panel aborts it.
    const searches = [];
    vi.mocked(runSearch).mockImplementation(options => new Promise(resolve => {
      searches.push(options);
      options.signal.addEventListener('abort', () => resolve({ status: 'stopped', winner: null, nonce: null, hash: null,
        attempts: 500, entrants: {} }), { once: true });
    }));
    render(<PoolPanel onClose={() => {}} />);
    join();
    await advance(0);
    expect(searches).toHaveLength(1);
    expect(searches[0].target).toBe('000000');
    expect(searches[0].entrants[0]).toMatchObject({ prefix: challenge.prefix, startNonce: START_NONCE });
    expect(status()).toBe('Searching nonces for a hash starting with 000000 in round 900300.');

    await advance(ROUND_CHECK_MS - 1);
    expect(searches[0].signal.aborted).toBe(false);
    expect(getChallenge).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(searches[0].signal.aborted).toBe(true);
    expect(getChallenge).toHaveBeenCalledTimes(2);
    expect(searches).toHaveLength(2);
    expect(searches[1].entrants[0].startNonce).toBe(START_NONCE + 500);
    expect(getLeaderboard).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(searches[1].signal.aborted).toBe(true);
    await advance(ROUND_CHECK_MS * 2);
    expect(getChallenge).toHaveBeenCalledTimes(2);
    expect(searches).toHaveLength(2);
    expect(submitProof).not.toHaveBeenCalled();
  });

  it('Stop ends the loop: a later round is neither searched nor submitted', async () => {
    let release;
    vi.mocked(getChallenge).mockResolvedValueOnce(makeChallenge(roundOf(900400)))
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(2));
    expect(stat('Accepted proofs')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(status()).toBe('Stopped. Accepted proofs stay on the leaderboard.');
    await act(async () => release(makeChallenge(roundOf(900401))));
    await settle(300);
    expect(submitProof).toHaveBeenCalledTimes(1);
    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(getChallenge).toHaveBeenCalledTimes(2);
    expect(stat('Accepted proofs')).toBe('1');
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
    expect(status()).toBe('Stopped. Accepted proofs stay on the leaderboard.');
  });

  it.each([[409, false], [410, true]])('keeps mining after a %i answer', async (code, newRound) => {
    const first = makeChallenge(roundOf(900500));
    const second = newRound ? makeChallenge(roundOf(900501)) : first;
    const firstProofs = proofsFrom(first, 2);
    const secondNonce = newRound ? proofsFrom(second, 1)[0].nonce : firstProofs[1].nonce;
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockImplementation(parked);
    vi.mocked(submitProof).mockRejectedValueOnce(httpError(code)).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(submitProof).toHaveBeenCalledTimes(2));
    expect(submitted()).toEqual([[first, firstProofs[0].nonce], [second, secondNonce]]);
    await waitFor(() => expect(stat('Accepted proofs')).toBe('1'));
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(3));
    expect(status()).toBe('Asking the pool for the current round…');
  });

  it('shows the unavailable state when the server is down and stops mining on 5xx or 429', async () => {
    vi.mocked(getLeaderboard).mockRejectedValue(Object.assign(new Error('unreachable'), { status: 0, code: 'network' }));
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
    expect(submitProof).not.toHaveBeenCalled();
  });

  it.each([
    ['HTTP 500', httpError(500)],
    ['HTTP 429', httpError(429)],
    ['a network failure', Object.assign(new Error('unreachable'), { status: 0, code: 'network' })],
  ])('stops mining and shows unavailable when a proof meets %s', async (_label, failure) => {
    vi.mocked(getChallenge).mockResolvedValueOnce(makeChallenge(roundOf(900600))).mockImplementation(parked);
    vi.mocked(submitProof).mockRejectedValueOnce(failure).mockImplementation(accept);
    render(<PoolPanel onClose={() => {}} />);
    join();
    await waitFor(() => expect(status()).toBe(UNAVAILABLE));
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
    await settle(50);
    expect(submitProof).toHaveBeenCalledTimes(1);
    expect(getChallenge).toHaveBeenCalledTimes(1);
    expect(stat('Accepted proofs')).toBe('0');
  });

  it('verifies a row in the browser: the preimage, the recomputed hash and whether it matches', async () => {
    const round = roundOf(900700);
    const honest = makeChallenge(round, 2, 'honest-miner');
    const [proof] = proofsFrom(honest, 1, 1000);
    const real = { name: 'honest-miner', round, nonce: proof.nonce, bestHash: proof.hash, bestZeros: leadingZeros(proof.hash),
      difficulty: hashDifficulty(proof.hash), proofs: 2, foundAt: 1_800_000_000_000 };
    // The listed hash belongs to another nonce than the one shown.
    const forged = makeChallenge(round, 2, 'forged-miner');
    const [claimed] = proofsFrom(forged, 1, 1000);
    const tampered = { name: 'forged-miner', round, nonce: claimed.nonce + 1, bestHash: claimed.hash,
      bestZeros: leadingZeros(claimed.hash), difficulty: hashDifficulty(claimed.hash), proofs: 1, foundAt: 1_800_000_000_001 };
    const recomputed = sha256(forged.prefix + tampered.nonce);
    expect(recomputed).not.toBe(claimed.hash);
    vi.mocked(getLeaderboard).mockResolvedValue({ round: { ...round, rows: [real, tampered] }, allTime: [real, tampered] });
    render(<PoolPanel onClose={() => {}} />);
    const allTime = await findRegion('All time · top 20');

    const verifyReal = within(allTime).getByRole('button', { name: 'Verify the proof of honest-miner' });
    expect(verifyReal.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(verifyReal);
    expect(verifyReal.getAttribute('aria-expanded')).toBe('true');
    const preimage = `proofofwork.fyi|${GENESIS.hash}|900700:${round.hash}|honest-miner|${proof.nonce}`;
    let check = within(allTime).getByRole('status');
    expect(within(check).getByText(preimage)).toBeTruthy();
    expect(within(check).getByText(proof.hash)).toBeTruthy();
    expect(within(check).getByText(
      `Matches the listed hash: ${real.bestZeros} zeros, mined by honest-miner in round 900700.`)).toBeTruthy();
    expect(within(region('This round · Bitcoin block #900700')).queryByRole('status')).toBeNull();

    fireEvent.click(within(allTime).getByRole('button', { name: 'Verify the proof of forged-miner' }));
    expect(verifyReal.getAttribute('aria-expanded')).toBe('false');
    check = within(allTime).getByRole('status');
    expect(within(check).getByText(forged.prefix + tampered.nonce)).toBeTruthy();
    expect(within(check).getByText(recomputed)).toBeTruthy();
    expect(within(check).getByText('Does not match the listed hash.')).toBeTruthy();
    expect(within(check).queryByText(/^Matches/)).toBeNull();
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

  it('shows a refused name next to the name field and stops without retrying', async () => {
    const refused = Object.assign(new Error('This name is not available. Please choose another.'),
      { status: 400, code: 'name-unavailable' });
    vi.mocked(getChallenge).mockRejectedValueOnce(refused).mockImplementation(parked);
    render(<PoolPanel onClose={() => {}} />);
    join('refused-name');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('This name is not available. Please choose another.');
    const input = screen.getByLabelText('Name on the leaderboard');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('pool-panel-name-error');
    expect(status()).toBe('Choose a name, then join to mine proofs for this round.');
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await settle(50);
    expect(getChallenge).toHaveBeenCalledTimes(1);
    expect(runSearch).not.toHaveBeenCalled();
    expect(submitProof).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'other-name' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getChallenge).mock.calls[1][0]).toBe('other-name');
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
