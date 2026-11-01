// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolPanel, ROUND_CHECK_MS } from '../components/PoolPanel';
import { getChallenge, getLeaderboard, submitProof } from '../lib/poolApi';
import { bitsOfZeros, displayHash, le, meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { hashAtNonce, sha256d } from '../lib/blockHeader';
import { formatDifficulty, GENESIS, hashDifficulty, leadingZeros, poolCandidate, proofPrefix, signatureOf } from '../lib/poolProof';
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
const START_NONCE = Math.floor(0.25 * 2 ** 32);
const NOW = 1_800_000_000_000;
const EMPTY = { recent: null, allTime: [] };
const hashOf = header => displayHash(header, sha256d);
// Synthetic Bitcoin rounds: the hash is the height in hex, so every height is a distinct round.
const roundOf = height => ({ height, hash: height.toString(16).padStart(64, '0') });
// The window is the last 144 blocks; a later window start moves an older round out of it.
const makeChallenge = (round, minZeros = 1, name = NAME, windowStart = round.height - 143) => ({ name, round, windowStart,
  prefix: proofPrefix(GENESIS.hash, round, name), minZeros, genesisHash: GENESIS.hash });
const recentOf = (round, rows = []) => ({ from: round.height - 143, to: round.height, rows });
const recentTitle = round => `Last 144 blocks · Bitcoin #${round.height - 143}–#${round.height}`;
const candidateOf = (challenge, zeros) => poolCandidate(signatureOf(challenge), { time: NOW / 1000, extraNonce: 0, zeros });
// The blocks an honest search finds from a start nonce, each with one more zero than the last.
function proofsFrom(challenge, count, start = START_NONCE) {
  const found = [];
  let nonce = start;
  while (found.length < count) {
    const zeros = found.length ? leadingZeros(found.at(-1).hash) + 1 : challenge.minZeros;
    const candidate = candidateOf(challenge, zeros);
    while (!meetsTarget(hashAtNonce(candidate.header, nonce), candidate.bits)) nonce++;
    found.push({ nonce, hash: hashAtNonce(candidate.header, nonce), header: candidate.header + le(nonce, 4), coinbase: candidate.coinbase, branch: [] });
    nonce++;
  }
  return found;
}
const rowOf = (name, round, proof, proofs = 1) => ({ name, round, header: proof.header, coinbase: proof.coinbase, branch: proof.branch,
  bestHash: proof.hash, bestZeros: leadingZeros(proof.hash), difficulty: hashDifficulty(proof.hash), proofs, foundAt: NOW });
const httpError = status => Object.assign(new Error(`Synthetic HTTP ${status}.`), { status });
// Holds the loop at "connecting" until the panel aborts the request.
const parked = (_name, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
});
const accept = async (signature, proof) => {
  const hash = hashOf(proof.header);
  return { accepted: true, hash, zeros: leadingZeros(hash), difficulty: hashDifficulty(hash), round: signature.round };
};
const best = hash => `${leadingZeros(hash)} · ${formatDifficulty(hashDifficulty(hash))}`;
const stat = label => screen.getByText(label, { selector: 'dt' }).nextElementSibling.textContent;
const status = () => screen.getAllByRole('status')[0].textContent;
const settle = ms => act(() => new Promise(resolve => setTimeout(resolve, ms)));
// The board section and its scrollable table share one heading; the section holds both.
const region = name => screen.getAllByRole('region', { name })[0];
const findRegion = async name => (await screen.findAllByRole('region', { name }))[0];
const submitted = () => vi.mocked(submitProof).mock.calls.map(([signature, proof]) => [signature.round.height, proof.header]);
const cells = row => within(row).getAllByRole('cell').map(cell => cell.textContent);
// The app owns the name; the first goal is one zero, so these searches stay short.
function Panel({ initial = '', ...props }) {
  const [name, setName] = useState(initial);
  return <PoolPanel name={name} onNameChange={setName} firstGoalZeros={1} {...props} />;
}
const join = (name = NAME) => {
  fireEvent.change(screen.getByLabelText('Name on the leaderboard'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));
};

beforeEach(async () => {
  vi.mocked(runSearch).mockImplementation((await vi.importActual('../lib/powSearch')).runSearch);
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
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
    const leader = { name: 'other-miner', round: roundOf(899990), header: '00'.repeat(80), coinbase: '00', branch: [],
      bestHash: `0000000abcdef${'1'.repeat(51)}`, bestZeros: 7, difficulty: 2.5e9, proofs: 1234, foundAt: NOW };
    const mine = { ...rowOf(NAME, round, proof), difficulty: 16 };
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    vi.mocked(getLeaderboard).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce({ recent: recentOf(round), allTime: [leader] })
      .mockResolvedValue({ recent: recentOf(round, [mine]), allTime: [leader, mine] });
    render(<Panel onClose={() => {}} />);
    await screen.findByText('No blocks in the last day. Mine one to lead the board.');
    expect(screen.getByText('No blocks yet.')).toBeTruthy();
    join();
    await waitFor(() => expect(submitProof).toHaveBeenCalledTimes(1));
    expect(getChallenge).toHaveBeenCalledWith(NAME, expect.anything());
    const search = vi.mocked(runSearch).mock.calls[0][0];
    expect(search.bits).toBe(bitsOfZeros(1));
    expect(search.entrants).toEqual([{ id: 'you', weight: 1, header: candidateOf(first, 1).header, startNonce: START_NONCE }]);
    const [signature, sent] = vi.mocked(submitProof).mock.calls[0];
    expect(signature).toEqual(signatureOf(first));
    expect(sent).toEqual({ header: proof.header, coinbase: proof.coinbase, branch: [] });
    expect(hashOf(sent.header)).toBe(proof.hash);
    await waitFor(() => expect(stat('Accepted blocks')).toBe('1'));
    expect(stat('Your best this round')).toBe(best(proof.hash));
    expect(stat('Round')).toBe('#900001');

    const thisRound = await findRegion(recentTitle(round));
    expect(within(thisRound).getAllByRole('columnheader').map(cell => cell.textContent))
      .toEqual(['Rank', 'Name', 'Best hash', 'Zeros', 'Difficulty', 'Blocks', 'Check']);
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

  it('raises its goal by one zero after each accepted block', async () => {
    const challenge = makeChallenge(roundOf(900100));
    const proofs = proofsFrom(challenge, 2);
    vi.mocked(getChallenge).mockResolvedValueOnce(challenge).mockResolvedValueOnce(challenge).mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    const onAccepted = vi.fn();
    render(<Panel onClose={() => {}} onAccepted={onAccepted} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(3));
    expect(vi.mocked(runSearch).mock.calls.map(([options]) => options.entrants[0].startNonce)).toEqual([START_NONCE, proofs[0].nonce + 1]);
    expect(vi.mocked(runSearch).mock.calls.map(([options]) => options.bits))
      .toEqual([bitsOfZeros(1), bitsOfZeros(leadingZeros(proofs[0].hash) + 1)]);
    expect(submitted()).toEqual(proofs.map(proof => [900100, proof.header]));
    await waitFor(() => expect(stat('Accepted blocks')).toBe('2'));
    expect(stat('Your best this round')).toBe(best(proofs[1].hash));
    expect(onAccepted).toHaveBeenCalledTimes(2);
    // The same round is not re-read; only accepted blocks refresh the board.
    expect(getLeaderboard).toHaveBeenCalledTimes(4);
  });

  it('starts over once its round leaves the window: fresh nonces, a fresh best and a refreshed board', async () => {
    const first = makeChallenge(roundOf(900200));
    const [firstProof] = proofsFrom(first, 1);
    const next = makeChallenge(roundOf(900201), 1, NAME, 900201);
    const [nextProof] = proofsFrom(next, 1);
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockResolvedValueOnce(next).mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    const nextBoard = { recent: recentOf(next.round), allTime: [] };
    vi.mocked(getLeaderboard).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY)
      .mockResolvedValue(nextBoard);
    render(<Panel onClose={() => {}} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(3));
    expect(vi.mocked(runSearch).mock.calls.map(([options]) => options.entrants[0]))
      .toMatchObject([{ header: candidateOf(first, 1).header, startNonce: START_NONCE }, { header: candidateOf(next, 1).header, startNonce: START_NONCE }]);
    expect(submitted()).toEqual([[900200, firstProof.header], [900201, nextProof.header]]);
    await waitFor(() => expect(stat('Accepted blocks')).toBe('2'));
    expect(stat('Round')).toBe(`#${next.round.height}`);
    expect(stat('Your best this round')).toBe(best(nextProof.hash));
    // Mount, round one, its proof, round two, its proof.
    expect(getLeaderboard).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('heading', { name: recentTitle(next.round) })).toBeTruthy();
  });

  it('keeps its round while a newer block still has it in the window', async () => {
    const first = makeChallenge(roundOf(900250));
    const [one] = proofsFrom(first, 1);
    // The pool already names a newer block, but 900250 is still among its last 144.
    const newer = makeChallenge(roundOf(900260));
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockResolvedValueOnce(newer).mockImplementation(parked);
    vi.mocked(submitProof).mockImplementation(accept);
    render(<Panel onClose={() => {}} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(3));
    expect(submitted().every(([height]) => height === 900250)).toBe(true);
    expect(submitted()[0]).toEqual([900250, one.header]);
    expect(stat('Round')).toBe('#900250');
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
    render(<Panel onClose={() => {}} />);
    join();
    await advance(0);
    expect(searches).toHaveLength(1);
    expect(searches[0].bits).toBe(bitsOfZeros(6));
    expect(searches[0].entrants[0]).toMatchObject({ header: candidateOf(challenge, 6).header, startNonce: START_NONCE });
    expect(status()).toBe('Searching nonces for a hash that beats your best in round 900300.');

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
    render(<Panel onClose={() => {}} />);
    join();
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(2));
    expect(stat('Accepted blocks')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(status()).toBe('Stopped. Accepted blocks stay on the leaderboard.');
    await act(async () => release(makeChallenge(roundOf(900401))));
    await settle(300);
    expect(submitProof).toHaveBeenCalledTimes(1);
    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(getChallenge).toHaveBeenCalledTimes(2);
    expect(stat('Accepted blocks')).toBe('1');
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
    expect(status()).toBe('Stopped. Accepted blocks stay on the leaderboard.');
  });

  it.each([[409, false], [410, true]])('keeps mining after a %i answer', async (code, newRound) => {
    const first = makeChallenge(roundOf(900500));
    const second = newRound ? makeChallenge(roundOf(900501)) : first;
    const [firstProof] = proofsFrom(first, 1);
    // A refused block leaves the goal where it was; a new round starts over.
    const [secondProof] = proofsFrom(second, 1, newRound ? START_NONCE : firstProof.nonce + 1);
    vi.mocked(getChallenge).mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockImplementation(parked);
    vi.mocked(submitProof).mockRejectedValueOnce(httpError(code)).mockImplementation(accept);
    render(<Panel onClose={() => {}} />);
    join();
    await waitFor(() => expect(submitProof).toHaveBeenCalledTimes(2));
    expect(submitted()).toEqual([[first.round.height, firstProof.header], [second.round.height, secondProof.header]]);
    await waitFor(() => expect(stat('Accepted blocks')).toBe('1'));
    await waitFor(() => expect(getChallenge).toHaveBeenCalledTimes(3));
    expect(status()).toBe('Asking the leaderboard for a round…');
  });

  it('shows the unavailable state when the server is down and stops mining on 5xx or 429', async () => {
    vi.mocked(getLeaderboard).mockRejectedValue(Object.assign(new Error('unreachable'), { status: 0, code: 'network' }));
    render(<Panel onClose={() => {}} />);
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
    render(<Panel onClose={() => {}} />);
    join();
    await waitFor(() => expect(status()).toBe(UNAVAILABLE));
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
    await settle(50);
    expect(submitProof).toHaveBeenCalledTimes(1);
    expect(getChallenge).toHaveBeenCalledTimes(1);
    expect(stat('Accepted blocks')).toBe('0');
  });

  it('verifies a row in the browser: the header, the recomputed hash and whether it matches', async () => {
    const round = roundOf(900700);
    const [proof] = proofsFrom(makeChallenge(round, 2, 'honest-miner'), 1, 1000);
    const real = rowOf('honest-miner', round, proof, 2);
    // The listed hash belongs to another nonce than the one in the header.
    const [claimed] = proofsFrom(makeChallenge(round, 2, 'forged-miner'), 1, 1000);
    const header = claimed.header.slice(0, 152) + le(claimed.nonce + 1, 4);
    const tampered = { ...rowOf('forged-miner', round, claimed), header };
    const recomputed = hashOf(header);
    expect(recomputed).not.toBe(claimed.hash);
    // Honest work claimed for someone else: the coinbase commits to the honest miner.
    const stolen = rowOf('stolen-name', round, proof);
    vi.mocked(getLeaderboard).mockResolvedValue({ recent: recentOf(round, [real, tampered]), allTime: [real, tampered, stolen] });
    render(<Panel onClose={() => {}} />);
    const allTime = await findRegion('All time · top 20');

    const verifyReal = within(allTime).getByRole('button', { name: 'Verify the proof of honest-miner' });
    expect(verifyReal.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(verifyReal);
    expect(verifyReal.getAttribute('aria-expanded')).toBe('true');
    let check = within(allTime).getByRole('status');
    expect(within(check).getByText(proof.header)).toBeTruthy();
    expect(within(check).getByText(proof.hash)).toBeTruthy();
    expect(within(check).getByText(
      `Matches the listed hash: ${real.bestZeros} zeros, signed by honest-miner in round 900700.`)).toBeTruthy();
    expect(within(region(recentTitle(round))).queryByRole('status')).toBeNull();

    fireEvent.click(within(allTime).getByRole('button', { name: 'Verify the proof of forged-miner' }));
    expect(verifyReal.getAttribute('aria-expanded')).toBe('false');
    check = within(allTime).getByRole('status');
    expect(within(check).getByText(header)).toBeTruthy();
    expect(within(check).getByText(recomputed)).toBeTruthy();
    expect(within(check).getByText('Does not match the listed hash and name.')).toBeTruthy();
    expect(within(check).queryByText(/^Matches/)).toBeNull();

    fireEvent.click(within(allTime).getByRole('button', { name: 'Verify the proof of stolen-name' }));
    expect(within(within(allTime).getByRole('status')).getByText('Does not match the listed hash and name.')).toBeTruthy();
  });

  it('names the genesis and says when a bridge genesis ends', async () => {
    render(<Panel onClose={() => {}} />);
    await settle(20);
    const line = document.querySelector('.pool-panel-genesis').textContent;
    expect(line).toContain(`Genesis ${GENESIS.hash.slice(0, 16)}…, built on Bitcoin block ${GENESIS.anchor.height}.`);
    expect(line.includes('the board starts again then')).toBe(GENESIS.status === 'bridge');
  });

  it('blocks Join for an invalid name and explains the rule', async () => {
    render(<Panel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByRole('alert').textContent).toBe('Use 3–20 characters: letters, digits or hyphens.');
    for (const name of ['ab', 'bad name!', 'under_score']) {
      join(name);
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByLabelText('Name on the leaderboard').getAttribute('aria-invalid')).toBe('true');
    }
    await settle(20);
    expect(getChallenge).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Name on the leaderboard'), { target: { value: 'fine-name' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a refused name next to the name field and stops without retrying', async () => {
    const refused = Object.assign(new Error('This name is not available. Please choose another.'),
      { status: 400, code: 'name-unavailable' });
    vi.mocked(getChallenge).mockRejectedValueOnce(refused).mockImplementation(parked);
    render(<Panel onClose={() => {}} />);
    join('refused-name');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('This name is not available. Please choose another.');
    const input = screen.getByLabelText('Name on the leaderboard');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('pool-panel-name-error');
    expect(status()).toBe('Choose a name, then join to mine for a better hash.');
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

  it('shows the name the app holds', () => {
    render(<Panel initial="stored-miner" onClose={() => {}} />);
    expect(screen.getByLabelText('Name on the leaderboard').value).toBe('stored-miner');
  });

  it.each(['close', 'unmount'])('stops mining on %s', async action => {
    vi.mocked(getChallenge).mockImplementation(parked);
    const onClose = vi.fn();
    const view = render(<Panel onClose={onClose} />);
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
