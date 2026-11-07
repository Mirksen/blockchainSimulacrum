// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MinerProfile } from '../components/MinerProfile';
import App from '../App';
import { getLeaderboard, getMiner, getRounds } from '../lib/poolApi';
import { le, meetsTarget } from '../../../shared/bitcoin-block.mjs';
import { hashAtNonce } from '../lib/blockHeader';
import { GENESIS, hashDifficulty, leadingZeros, poolCandidate, proofPrefix, signatureOf } from '../lib/poolProof';
import { HINTS } from '../lib/hints';

vi.mock('../lib/poolApi', async importOriginal => ({ ...(await importOriginal()),
  getChallenge: vi.fn(), submitProof: vi.fn(), getLeaderboard: vi.fn(), getMiner: vi.fn(), getRounds: vi.fn().mockResolvedValue([]) }));
// App around the Leaderboard tab: the simulation and the other views are covered elsewhere.
vi.mock('../hooks/useMinerIdentity', () => ({ useMinerIdentity: () => ({ name: 'own-miner', setName: () => {}, signer: {} }) }));
vi.mock('../hooks/useBlockchain', () => ({ useBlockchain: () => ({
  setSigner: () => {},
  blocks: [{}], participants: [], balances: [], memPool: [], chainValid: true,
  isMining: false, isSettingUp: false, difficulty: 2, halvingInterval: 4,
}) }));
vi.mock('../components/workbench/Workbench', () => ({ Workbench: () => <div>Workbench view</div> }));
vi.mock('../components/workbench/TopBar', () => ({ TopBar: () => null }));
vi.mock('../components/workbench/LeaderboardTicker', () => ({ LeaderboardTicker: () => null }));

const NAME = 'test-miner';
const FOUND_AT = 1_800_000_000_000;
// Synthetic Bitcoin rounds: the hash is the height in hex.
const roundOf = height => ({ height, hash: height.toString(16).padStart(64, '0') });
const UNAVAILABLE = 'The leaderboard server is unavailable right now. The simulator keeps working.';

// A real block signed by `name` in `round`: the first nonce from `start` with at least one zero.
function blockOf(name, round, { start = 0, proofs = 1, inWindow = true } = {}) {
  const signature = signatureOf({ name, round, prefix: proofPrefix(GENESIS.hash, round, name) });
  const candidate = poolCandidate(signature, { time: FOUND_AT / 1000, extraNonce: 0, zeros: 1 });
  let nonce = start;
  while (!meetsTarget(hashAtNonce(candidate.header, nonce), candidate.bits)) nonce++;
  const hash = hashAtNonce(candidate.header, nonce);
  return { name, round, header: candidate.header + le(nonce, 4), coinbase: candidate.coinbase, branch: [], bestHash: hash,
    bestZeros: leadingZeros(hash), difficulty: hashDifficulty(hash), proofs, foundAt: FOUND_AT, inWindow };
}

const NEW = blockOf(NAME, roundOf(900200), { proofs: 3 });
const OLD = blockOf(NAME, roundOf(900010), { proofs: 1234, inWindow: false });
const BEST = [NEW.bestHash, OLD.bestHash].sort()[0];
const PROFILE = { name: NAME, rank: { window: 4, allTime: 12 }, blocks: [NEW, OLD] };
const stat = label => screen.getByText(label, { selector: 'dt' }).nextElementSibling.textContent;
const rows = () => within(screen.getByRole('region', { name: 'Rounds' })).getAllByRole('row').slice(1);
const unknown = () => Object.assign(new Error('No blocks for this name yet.'), { status: 404, code: 'unknown-name' });
const boardRow = name => ({ ...blockOf(name, roundOf(900200)), name });

beforeEach(() => {
  vi.mocked(getRounds).mockResolvedValue([]);
  vi.mocked(getMiner).mockReset();
  vi.mocked(getLeaderboard).mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('MinerProfile', () => {
  it('shows the name, both ranks, the rounds, the blocks sent and the whole best hash', async () => {
    vi.mocked(getMiner).mockResolvedValue(PROFILE);
    render(<MinerProfile name={NAME} />);
    expect(screen.getByText('Loading the profile…')).toBeTruthy();
    await screen.findByRole('region', { name: 'Rounds' });
    expect(vi.mocked(getMiner).mock.calls[0][0]).toBe(NAME);
    expect(screen.getByRole('heading', { name: NAME })).toBeTruthy();
    expect(stat('Rank · last 144 blocks')).toBe('#4');
    expect(stat('Rank · all time')).toBe('#12');
    expect(stat('Rounds')).toBe('2');
    expect(stat('Blocks sent')).toBe('1,237');
    const best = document.querySelector('.miner-profile-hash');
    expect(best.textContent).toBe(BEST);
    expect(best.textContent).toHaveLength(64);
    expect(best.querySelector('.miner-profile-zero').textContent).toBe('0'.repeat(leadingZeros(BEST)));
    expect(screen.queryByText('you')).toBeNull();
  });

  it('lists each round with its Bitcoin block, zeros, difficulty, blocks and time', async () => {
    vi.mocked(getMiner).mockResolvedValue(PROFILE);
    render(<MinerProfile name={NAME} />);
    await screen.findByRole('region', { name: 'Rounds' });
    const [first, second] = rows();
    const link = within(first).getByRole('link', { name: '#900200' });
    expect(link.getAttribute('href')).toBe('https://mempool.space/block/900200');
    expect(link.getAttribute('target')).toBe('_blank');
    const cells = within(second).getAllByRole('cell').map(cell => cell.textContent);
    expect(cells.slice(0, 2)).toEqual(['#900010', String(OLD.bestZeros)]);
    expect(cells[3]).toBe('1,234');
    expect(second.querySelector('time').getAttribute('dateTime')).toBe(new Date(FOUND_AT).toISOString());
  });

  it('verifies a round in this browser, and says so when a block does not match', async () => {
    const forged = { ...OLD, bestHash: `0000${'f'.repeat(60)}` };
    vi.mocked(getMiner).mockResolvedValue({ ...PROFILE, blocks: [NEW, forged] });
    render(<MinerProfile name={NAME} />);
    await screen.findByRole('region', { name: 'Rounds' });
    const verify = screen.getByRole('button', { name: 'Verify the block of round 900200' });
    expect(verify.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(verify);
    expect(verify.getAttribute('aria-expanded')).toBe('true');
    const check = document.querySelector('.miner-profile-verify');
    expect(check.textContent).toContain(NEW.header);
    expect(check.textContent).toContain(NEW.bestHash);
    expect(within(check).getByText(`Matches the listed hash: ${NEW.bestZeros} ${NEW.bestZeros === 1 ? 'zero' : 'zeros'}, signed by ${NAME} in round 900200.`)
      .className).toBe('miner-profile-verify-ok');
    fireEvent.click(screen.getByRole('button', { name: 'Verify the block of round 900010' }));
    expect(verify.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Does not match the listed hash and name.').className).toBe('miner-profile-verify-bad');
  });

  it('shows a dash for a rank the name does not hold, and marks the visitor\'s own name', async () => {
    vi.mocked(getMiner).mockResolvedValue({ ...PROFILE, rank: { window: null, allTime: 12 } });
    render(<MinerProfile name={NAME} ownName={NAME} />);
    await screen.findByRole('region', { name: 'Rounds' });
    expect(stat('Rank · last 144 blocks')).toBe('—');
    expect(screen.getByText('you').className).toBe('miner-profile-you');
  });

  it('explains Verify through a hint', async () => {
    vi.mocked(getMiner).mockResolvedValue(PROFILE);
    render(<MinerProfile name={NAME} />);
    await screen.findByRole('region', { name: 'Rounds' });
    const verify = screen.getAllByRole('button', { name: /^Verify the block of round / })[0];
    expect(verify.getAttribute('data-hint')).toBe(HINTS['pool.verify'].text);
  });

  it('copies the shareable link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      vi.mocked(getMiner).mockResolvedValue(PROFILE);
      render(<MinerProfile name={NAME} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      await screen.findByText('Link copied.');
      expect(writeText).toHaveBeenCalledWith(`${location.origin}${location.pathname}${location.search}#/pool/test-miner`);
      writeText.mockRejectedValue(new Error('denied'));
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await screen.findByText('Could not copy. The address bar holds the link.');
    } finally {
      delete navigator.clipboard;
    }
  });

  it('says plainly when a name has no blocks, and asks nothing for a malformed name', async () => {
    const onBack = vi.fn();
    vi.mocked(getMiner).mockRejectedValue(unknown());
    render(<MinerProfile name="nobody-here" onBack={onBack} />);
    await screen.findByText('No blocks for this name yet.');
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    const back = screen.getByRole('link', { name: 'Leaderboard' });
    expect(back.getAttribute('href')).toBe('#/pool');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    cleanup();
    vi.mocked(getMiner).mockClear();
    render(<MinerProfile name="a b" />);
    expect(screen.getByText('No blocks for this name yet.')).toBeTruthy();
    expect(getMiner).not.toHaveBeenCalled();
  });

  it('shows the unavailable message when the server cannot answer', async () => {
    vi.mocked(getMiner).mockRejectedValue(Object.assign(new Error('down'), { status: 0, code: 'network' }));
    render(<MinerProfile name={NAME} />);
    expect((await screen.findByText(UNAVAILABLE)).className).toBe('miner-profile-note');
  });
});

describe('miner profile route in App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('requestAnimationFrame', callback => callback());
    vi.mocked(getLeaderboard).mockResolvedValue({ recent: null, allTime: [boardRow(NAME), boardRow('other-miner')] });
    vi.mocked(getMiner).mockImplementation(async name => ({ ...PROFILE, name, blocks: [{ ...NEW, name }] }));
  });
  afterEach(() => history.replaceState(null, '', '/'));

  it('opens #/pool/<name> directly as the profile inside the Leaderboard tab', async () => {
    history.replaceState(null, '', '/#/pool/test-miner');
    render(<App />);
    expect(await screen.findByRole('heading', { name: NAME })).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('aria-label')).toBe('Leaderboard');
    expect(screen.queryByRole('heading', { name: 'All time · top 20' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Leaderboard' }));
    expect(location.hash).toBe('#/pool');
    expect(await screen.findByRole('heading', { name: 'All time · top 20' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: NAME })).toBeNull();
  });

  it('opens a profile from a board row and returns to the board with back navigation', async () => {
    history.replaceState(null, '', '/#/pool');
    render(<App />);
    const allTime = (await screen.findAllByRole('region', { name: 'All time · top 20' }))[0];
    const name = await within(allTime).findByRole('link', { name: 'other-miner' });
    expect(name.getAttribute('href')).toBe('#/pool/other-miner');
    fireEvent.click(name);
    expect(location.hash).toBe('#/pool/other-miner');
    expect(await screen.findByRole('heading', { name: 'other-miner' })).toBeTruthy();
    expect(getMiner).toHaveBeenLastCalledWith('other-miner', expect.anything());
    await act(async () => { history.back(); });
    await waitFor(() => expect(location.hash).toBe('#/pool'));
    expect(await screen.findByRole('heading', { name: 'All time · top 20' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'other-miner' })).toBeNull();
  });

  it('decodes an encoded name in the address', async () => {
    history.replaceState(null, '', `/#/pool/${encodeURIComponent('own-miner')}`);
    render(<App />);
    expect(await screen.findByText('you')).toBeTruthy();
    expect(getMiner).toHaveBeenCalledWith('own-miner', expect.anything());
  });
});


it('shows retained totals and best beyond the newest displayed rounds, and shares that best', async () => {
  const writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const oldBest = '000000' + 'a'.repeat(58);
  vi.mocked(getMiner).mockResolvedValue({ ...PROFILE, summary: {
    allTime: { bestHash: oldBest, bestZeros: 6, proofs: 9876, rounds: 250 },
    window: { bestHash: NEW.bestHash, bestZeros: NEW.bestZeros, proofs: 3, rounds: 1 }
  } });
  render(<MinerProfile name={NAME} />);
  await screen.findByRole('region', { name: 'Rounds' });
  expect(stat('Rounds')).toBe('250');
  expect(stat('Blocks sent')).toBe('9,876');
  expect(document.querySelector('.miner-profile-best .miner-profile-hash').textContent).toBe(oldBest);
  fireEvent.click(screen.getByRole('button', { name: 'Share best find' }));
  await screen.findByText('Find and link copied.');
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining(oldBest));
  delete navigator.clipboard;
});
