import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChallenge, getLeaderboard, getMiner, getRounds, isValidPoolName, POOL_TIMEOUT_MS, submitProof } from '../lib/poolApi';
import { GENESIS, proofPrefix } from '../lib/poolProof';

const BASE = 'https://api.proofofwork.fyi';
const NAME = 'test-miner';
const OTHER_GENESIS = 'e'.repeat(64);
const ROUND = { height: 900001, hash: `0000${'ab'.repeat(30)}` };
const challenge = { name: NAME, round: ROUND, windowStart: ROUND.height - 143, prefix: proofPrefix(GENESIS.hash, ROUND, NAME), minZeros: 6,
  genesisHash: GENESIS.hash };
const RECENT = { from: ROUND.height - 143, to: ROUND.height };
const PROOF = { header: 'ab'.repeat(80), coinbase: 'cd'.repeat(120), branch: ['ef'.repeat(32)] };
const row = (overrides = {}) => ({ name: NAME, round: ROUND, ...PROOF, bestHash: `00000${'c'.repeat(59)}`, bestZeros: 5,
  difficulty: 65536, proofs: 3, foundAt: 1_800_000_000_000, ...overrides });
const answer = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const refusal = async promise => {
  const error = await promise.catch(caught => caught);
  expect(error).toBeInstanceOf(Error);
  expect(error.status).toBe(0);
  expect(error.code).toBe('invalid');
  return error;
};

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('pool API client', () => {
  it('requests the round for the encoded name with GET and accepts a challenge for this genesis', async () => {
    fetchMock.mockResolvedValue(answer(challenge));
    expect(await getChallenge(NAME)).toEqual(challenge);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/challenge?name=test-miner`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('omit');
    await getChallenge('a b&c').catch(() => {});
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/challenge?name=a%20b%26c`);
  });

  it('refuses a challenge for another genesis, even with a matching prefix', async () => {
    fetchMock.mockResolvedValue(answer({ ...challenge, genesisHash: OTHER_GENESIS }));
    await refusal(getChallenge(NAME));
    fetchMock.mockResolvedValue(answer({ ...challenge, genesisHash: OTHER_GENESIS, prefix: proofPrefix(OTHER_GENESIS, ROUND, NAME) }));
    await refusal(getChallenge(NAME));
    fetchMock.mockResolvedValue(answer({ ...challenge, genesisHash: undefined }));
    await refusal(getChallenge(NAME));
  });

  it('refuses a prefix the client does not rebuild itself', async () => {
    const otherRound = { height: ROUND.height + 1, hash: 'f'.repeat(64) };
    for (const prefix of [proofPrefix(GENESIS.hash, ROUND, 'other-miner'), proofPrefix(GENESIS.hash, otherRound, NAME),
      proofPrefix(OTHER_GENESIS, ROUND, NAME), `${challenge.prefix}1`, '']) {
      fetchMock.mockResolvedValue(answer({ ...challenge, prefix }));
      await refusal(getChallenge(NAME));
    }
  });

  it('refuses a challenge for another name', async () => {
    fetchMock.mockResolvedValue(answer({ ...challenge, name: 'other-miner', prefix: proofPrefix(GENESIS.hash, ROUND, 'other-miner') }));
    await refusal(getChallenge(NAME));
    fetchMock.mockResolvedValue(answer(challenge));
    await refusal(getChallenge('other-miner'));
  });

  it('refuses a missing or impossible window start', async () => {
    for (const windowStart of [undefined, '1', 1.5, ROUND.height + 1]) {
      fetchMock.mockResolvedValue(answer({ ...challenge, windowStart }));
      await refusal(getChallenge(NAME));
    }
  });

  it('refuses a bad round or minimum', async () => {
    const badRounds = [null, { height: -1, hash: ROUND.hash }, { height: 1.5, hash: ROUND.hash }, { height: '900001', hash: ROUND.hash },
      { height: ROUND.height, hash: 'ab' }, { height: ROUND.height, hash: ROUND.hash.toUpperCase() }];
    for (const round of badRounds) {
      fetchMock.mockResolvedValue(answer({ ...challenge, round }));
      await refusal(getChallenge(NAME));
    }
    for (const minZeros of [0, 65, 2.5, '6', undefined]) {
      fetchMock.mockResolvedValue(answer({ ...challenge, minZeros }));
      await refusal(getChallenge(NAME));
    }
    fetchMock.mockResolvedValue(answer(null));
    await refusal(getChallenge(NAME));
  });

  it('posts exactly the name, the round and the block proof as JSON', async () => {
    const accepted = { accepted: true, hash: `000000${'d'.repeat(58)}`, zeros: 6, difficulty: 1048576, round: ROUND };
    fetchMock.mockResolvedValue(answer(accepted));
    const extra = { ...challenge, round: { ...ROUND, time: 1_800_000_000 }, sig: 'b'.repeat(64) };
    expect(await submitProof(extra, PROOF)).toEqual(accepted);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/shares`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body)).toStrictEqual({ name: NAME, round: { height: ROUND.height, hash: ROUND.hash }, ...PROOF });
  });

  it('reads the leaderboard with GET: the last 144 blocks and all time', async () => {
    const roundRows = [row(), row({ name: 'other-miner', bestHash: `0000${'1'.repeat(60)}`, bestZeros: 4, difficulty: 4096.5, proofs: 1 })];
    const allTime = [row({ round: { height: 899990, hash: 'a'.repeat(64) }, bestHash: `0000000${'2'.repeat(57)}`, bestZeros: 7,
      difficulty: 2.5e9, proofs: 12 }), ...roundRows];
    fetchMock.mockResolvedValue(answer({ genesisHash: GENESIS.hash, recent: { ...RECENT, rows: roundRows }, allTime }));
    expect(await getLeaderboard()).toEqual({ recent: { ...RECENT, rows: roundRows }, allTime });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/leaderboard`);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');

    fetchMock.mockResolvedValue(answer({ genesisHash: GENESIS.hash, recent: null, allTime: [] }));
    expect(await getLeaderboard()).toEqual({ recent: null, allTime: [] });
  });

  it('drops malformed rows and keeps the valid ones', async () => {
    const good = row();
    const bad = [null, 'row', row({ name: 'x' }), row({ name: 'with space' }), row({ round: { height: -1, hash: ROUND.hash } }),
      row({ round: null }), row({ header: 'abc' }), row({ header: undefined }), row({ coinbase: 'xyz' }), row({ branch: 'ab' }), row({ branch: ['ab'] }), row({ bestHash: 'abc' }), row({ bestHash: undefined }),
      row({ bestZeros: '5' }), row({ difficulty: Infinity }), row({ difficulty: 'high' }), row({ proofs: 1.5 })];
    fetchMock.mockResolvedValue(answer({ recent: { ...RECENT, rows: [...bad, good] }, allTime: [good, ...bad] }));
    expect(await getLeaderboard()).toEqual({ recent: { ...RECENT, rows: [good] }, allTime: [good] });
  });

  it('refuses a malformed board', async () => {
    const boards = [null, [row()], { recent: null }, { recent: null, allTime: 'rows' }, { allTime: [] },
      { recent: { ...RECENT }, allTime: [] }, { recent: { from: 'a', to: ROUND.height, rows: [] }, allTime: [] },
      { recent: { from: ROUND.height + 1, to: ROUND.height, rows: [] }, allTime: [] }, { recent: { to: ROUND.height, rows: [] }, allTime: [] }];
    for (const board of boards) {
      fetchMock.mockResolvedValue(answer(board));
      await refusal(getLeaderboard());
    }
  });

  it('marks an unreadable answer as invalid', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('synthetic'); } });
    const error = await refusal(getLeaderboard());
    expect(error.message).toBe('The leaderboard server sent an unreadable answer.');
  });

  it.each([400, 409, 410, 413, 422, 429, 500, 503])('turns HTTP %i into an error with that status', async status => {
    fetchMock.mockResolvedValue(answer({ error: 'synthetic failure' }, status));
    const error = await submitProof(challenge, PROOF).catch(caught => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(status);
    expect(error.code).toBeUndefined();
    expect(error.message).toMatch(/\.$/);
    expect(error.message).not.toContain('synthetic failure');
  });

  it('explains a counted block and a finished round', async () => {
    fetchMock.mockResolvedValue(answer({ error: 'duplicate proof' }, 409));
    expect((await submitProof(challenge, PROOF).catch(caught => caught)).message).toBe('This block was already counted.');
    fetchMock.mockResolvedValue(answer({ error: 'round over' }, 410));
    expect((await submitProof(challenge, PROOF).catch(caught => caught)).message).toBe('This round is over: its Bitcoin block left the window.');
  });

  it('turns a 400 "name unavailable" answer into a name-unavailable error', async () => {
    for (const call of [() => getChallenge(NAME), () => submitProof(challenge, PROOF)]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(answer({ error: 'name unavailable' }, 400));
      const error = await call().catch(caught => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error.status).toBe(400);
      expect(error.code).toBe('name-unavailable');
      expect(error.message).toBe('This name is not available. Please choose another.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps other 400 answers generic, even with an unreadable body', async () => {
    fetchMock.mockResolvedValue(answer({ error: 'invalid name' }, 400));
    const invalid = await getChallenge(NAME).catch(caught => caught);
    expect(invalid.status).toBe(400);
    expect(invalid.code).toBeUndefined();
    expect(invalid.message).toBe('The leaderboard did not accept this request.');
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => { throw new SyntaxError('synthetic'); } });
    const unreadable = await getChallenge(NAME).catch(caught => caught);
    expect(unreadable.status).toBe(400);
    expect(unreadable.code).toBeUndefined();
    fetchMock.mockResolvedValue(answer({ error: 'name unavailable' }, 403));
    const forbidden = await submitProof(challenge, PROOF).catch(caught => caught);
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBeUndefined();
  });

  it('times out after ten seconds with a status 0 error', async () => {
    vi.useFakeTimers();
    let signal;
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init.signal;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = getLeaderboard().catch(caught => caught);
    await vi.advanceTimersByTimeAsync(POOL_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(signal.aborted).toBe(true);
    expect(error.status).toBe(0);
    expect(error.code).toBe('timeout');
    expect(error.message).toBe('The leaderboard server did not answer in time.');
  });

  it('reports an unreachable server and a caller abort differently', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    for (const call of [() => getLeaderboard(), () => getChallenge(NAME), () => submitProof(challenge, PROOF)]) {
      const unreachable = await call().catch(caught => caught);
      expect(unreachable.status).toBe(0);
      expect(unreachable.code).toBe('network');
      expect(unreachable.message).toBe('The leaderboard server could not be reached.');
    }
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = getChallenge(NAME, { signal: controller.signal }).catch(caught => caught);
    controller.abort();
    expect((await pending).name).toBe('AbortError');
  });

  it('reads a miner profile with GET for the encoded name; each block carries the name', async () => {
    const { name: _name, ...block } = row();
    const blocks = [{ ...block, inWindow: true }, { ...block, round: { height: 899990, hash: 'a'.repeat(64) }, inWindow: false }];
    fetchMock.mockResolvedValue(answer({ name: NAME, rank: { window: 3, allTime: null }, blocks }));
    expect(await getMiner(NAME)).toEqual({ name: NAME, rank: { window: 3, allTime: null }, blocks: blocks.map(b => ({ ...b, name: NAME })) });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/miner?name=test-miner`);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
  });

  it('refuses a malformed profile and drops malformed blocks', async () => {
    const { name: _name, ...block } = row();
    const good = { ...block, inWindow: true };
    const profile = (overrides = {}) => ({ name: NAME, rank: { window: 1, allTime: 1 }, blocks: [good], ...overrides });
    for (const bad of [null, [good], profile({ name: 'other-miner' }), profile({ name: undefined }), profile({ rank: null }),
      profile({ rank: { window: 0, allTime: 1 } }), profile({ rank: { window: 1, allTime: 1.5 } }), profile({ rank: { window: '1', allTime: 1 } }),
      profile({ rank: { allTime: 1 } }), profile({ blocks: 'rows' }), profile({ blocks: undefined })]) {
      fetchMock.mockResolvedValue(answer(bad));
      await refusal(getMiner(NAME));
    }
    const badBlocks = [null, { ...good, inWindow: 'yes' }, { ...block }, { ...good, foundAt: 'now' }, { ...good, header: 'abc' },
      { ...good, bestHash: 'abc' }, { ...good, round: null }, { ...good, proofs: 1.5 }];
    fetchMock.mockResolvedValue(answer(profile({ blocks: [...badBlocks, good] })));
    expect((await getMiner(NAME)).blocks).toEqual([{ ...good, name: NAME }]);
  });

  it('turns a 404 "unknown name" answer into an unknown-name error; other 404s stay generic', async () => {
    fetchMock.mockResolvedValue(answer({ error: 'unknown name' }, 404));
    const unknown = await getMiner(NAME).catch(caught => caught);
    expect(unknown.status).toBe(404);
    expect(unknown.code).toBe('unknown-name');
    expect(unknown.message).toBe('No blocks for this name yet.');
    fetchMock.mockResolvedValue(answer({ error: 'not found' }, 404));
    const other = await getMiner(NAME).catch(caught => caught);
    expect(other.status).toBe(404);
    expect(other.code).toBeUndefined();
  });

  it('validates names like the server', () => {
    for (const name of ['abc', 'test-miner', 'A1-b2', 'x'.repeat(20)]) expect(isValidPoolName(name)).toBe(true);
    for (const name of ['ab', 'x'.repeat(21), 'with space', 'emoji🙂', 'under_score', '', null]) expect(isValidPoolName(name)).toBe(false);
  });
});


describe('finished rounds and retained summaries', () => {
  it('accepts bounded history and rejects malformed or foreign answers', async () => {
    const item = { name: NAME, round: ROUND, bestHash: row().bestHash, bestZeros: 5, proofs: 3, miners: 1 };
    fetchMock.mockResolvedValue(answer({ genesisHash: GENESIS.hash, rounds: [item] }));
    expect(await getRounds()).toEqual([item]);
    for (const body of [null, { genesisHash: OTHER_GENESIS, rounds: [] },
      { genesisHash: GENESIS.hash, rounds: Array(21).fill(item) },
      ...[{ proofs: -1 }, { miners: 0 }, { round: null }, { bestHash: 'bad' }, { name: 'a b' }].map(bad => ({ genesisHash: GENESIS.hash, rounds: [{ ...item, ...bad }] }))]) {
      fetchMock.mockResolvedValue(answer(body));
      await refusal(getRounds());
    }
  });
  it('validates summaries independently of displayed rounds', async () => {
    const summary = { allTime: { bestHash: row().bestHash, bestZeros: 5, proofs: 300, rounds: 250 }, window: null };
    const miner = { name: NAME, rank: { window: null, allTime: 2 }, blocks: [], summary };
    fetchMock.mockResolvedValue(answer(miner));
    expect((await getMiner(NAME)).summary).toEqual(summary);
    fetchMock.mockResolvedValue(answer({ ...miner, summary: { ...summary, allTime: { ...summary.allTime, proofs: -1 } } }));
    await refusal(getMiner(NAME));
  });
});
