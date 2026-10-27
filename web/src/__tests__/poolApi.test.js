import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChallenge, getLeaderboard, isValidPoolName, POOL_TIMEOUT_MS, submitShare } from '../lib/poolApi';

const BASE = 'https://api.proofofwork.fyi';
const challenge = { id: 'a'.repeat(32), name: 'test-miner', zeros: 4, expiresAt: 1_800_000_600_000,
  sig: 'b'.repeat(64), prefix: `proofofwork.fyi|${'a'.repeat(32)}|test-miner|` };
const answer = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('pool API client', () => {
  it('requests a challenge for the encoded name with GET', async () => {
    fetchMock.mockResolvedValue(answer(challenge));
    expect(await getChallenge('test-miner')).toEqual(challenge);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/challenge?name=test-miner`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('omit');
    await getChallenge('a b&c').catch(() => {});
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/challenge?name=a%20b%26c`);
  });

  it('posts only the signed challenge fields and the nonce as JSON', async () => {
    fetchMock.mockResolvedValue(answer({ accepted: true, zeros: 5, points: 65536 }));
    expect(await submitShare(challenge, 42)).toEqual({ accepted: true, zeros: 5, points: 65536 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/shares`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ challenge: { id: challenge.id, name: 'test-miner', zeros: 4,
      expiresAt: challenge.expiresAt, sig: challenge.sig }, nonce: 42 });
  });

  it('reads the leaderboard with GET', async () => {
    const rows = [{ name: 'test-miner', points: 65536, shares: 1, bestHash: '0000'.padEnd(64, 'f'), bestZeros: 4 }];
    fetchMock.mockResolvedValue(answer(rows));
    expect(await getLeaderboard()).toEqual(rows);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/leaderboard`);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it.each([400, 403, 409, 410, 413, 422, 429, 500, 503])('turns HTTP %i into an error with that status', async status => {
    fetchMock.mockResolvedValue(answer({ error: 'synthetic failure' }, status));
    const error = await submitShare(challenge, 1).catch(caught => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(status);
    expect(error.message).toMatch(/\.$/);
    expect(error.message).not.toContain('synthetic failure');
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
    const unreachable = await getLeaderboard().catch(caught => caught);
    expect(unreachable.status).toBe(0);
    expect(unreachable.code).toBe('network');
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = getChallenge('test-miner', { signal: controller.signal }).catch(caught => caught);
    controller.abort();
    expect((await pending).name).toBe('AbortError');
  });

  it('rejects malformed answers', async () => {
    fetchMock.mockResolvedValue(answer({ error: 'not a list' }));
    expect((await getLeaderboard().catch(caught => caught)).status).toBe(0);
    fetchMock.mockResolvedValue(answer({ ...challenge, zeros: 'four' }));
    expect((await getChallenge('test-miner').catch(caught => caught)).status).toBe(0);
  });

  it('validates names like the server', () => {
    for (const name of ['abc', 'test-miner', 'A1-b2', 'x'.repeat(20)]) expect(isValidPoolName(name)).toBe(true);
    for (const name of ['ab', 'x'.repeat(21), 'with space', 'emoji🙂', 'under_score', '', null]) expect(isValidPoolName(name)).toBe(false);
  });
});
