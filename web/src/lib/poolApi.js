// Client for the leaderboard pool server. Every call has its own timeout and
// turns a failed answer into an Error with a numeric `status` (0 when the
// server could not be reached or answered with something unreadable).

export const POOL_API = (import.meta.env?.VITE_POOL_API || 'https://api.proofofwork.fyi').replace(/\/+$/, '');
export const POOL_TIMEOUT_MS = 10_000;

// Same rule as the server: 3–20 letters, digits or hyphens.
const NAME_PATTERN = /^[A-Za-z0-9-]{3,20}$/;
export const isValidPoolName = name => typeof name === 'string' && NAME_PATTERN.test(name);

const MESSAGES = {
  400: 'The pool did not accept this request.',
  403: 'The pool did not recognise this target.',
  409: 'This share was already counted.',
  410: 'This target has expired.',
  413: 'The share was too large to send.',
  422: 'This hash does not meet the target.',
  429: 'Too many requests to the pool. Please wait a minute.',
};

function poolError(status, message, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

export const NAME_UNAVAILABLE_MESSAGE = 'This name is not available. Please choose another.';

const messageFor = status => MESSAGES[status] ||
  (status >= 500 ? 'The leaderboard server is unavailable right now.' : 'The pool answered with an unexpected error.');

// The server decides which names are available; a refused name gets its own code
// so the panel can point at the name field instead of retrying. 400 refuses a new
// challenge, 403 a share for a name that was hidden while its player was mining.
async function failureFor(response) {
  if (response.status === 400 || response.status === 403) {
    let body = null;
    try { body = await response.json(); } catch { /* No readable body: a plain error. */ }
    if (body?.error === 'name unavailable') {
      return poolError(response.status, NAME_UNAVAILABLE_MESSAGE, 'name-unavailable');
    }
  }
  return poolError(response.status, messageFor(response.status));
}

async function request(path, { method = 'GET', body, signal } = {}) {
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, POOL_TIMEOUT_MS);
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward, { once: true });
  const failure = (fallback, code) => {
    if (timedOut) return poolError(0, 'The leaderboard server did not answer in time.', 'timeout');
    if (signal?.aborted) return new DOMException('The request was cancelled.', 'AbortError');
    return poolError(0, fallback, code);
  };
  try {
    let response;
    try {
      response = await fetch(`${POOL_API}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch {
      throw failure('The leaderboard server could not be reached.', 'network');
    }
    if (!response.ok) throw await failureFor(response);
    try {
      return await response.json();
    } catch {
      throw failure('The leaderboard server sent an unreadable answer.', 'invalid');
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

const invalidAnswer = () => poolError(0, 'The leaderboard server sent an unreadable answer.', 'invalid');

export async function getChallenge(name, { signal } = {}) {
  const challenge = await request(`/api/challenge?name=${encodeURIComponent(name)}`, { signal });
  if (!challenge || typeof challenge.prefix !== 'string' || !Number.isInteger(challenge.zeros) ||
    challenge.zeros < 1 || challenge.zeros > 64 || !Number.isSafeInteger(challenge.expiresAt)) throw invalidAnswer();
  return challenge;
}

export function submitShare(challenge, nonce, { signal } = {}) {
  // Only the signed fields travel back; the server derives the prefix itself.
  const { id, name, zeros, expiresAt, sig } = challenge;
  return request('/api/shares', { method: 'POST', body: { challenge: { id, name, zeros, expiresAt, sig }, nonce }, signal });
}

export async function getLeaderboard({ signal } = {}) {
  const rows = await request('/api/leaderboard', { signal });
  if (!Array.isArray(rows)) throw invalidAnswer();
  return rows;
}
