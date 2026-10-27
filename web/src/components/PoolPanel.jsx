import { useEffect, useRef, useState } from 'react';
import { getChallenge, getLeaderboard, isValidPoolName, NAME_UNAVAILABLE_MESSAGE, submitShare } from '../lib/poolApi';
import { runSearch } from '../lib/powSearch';
import './PoolPanel.css';

const NAME_KEY = 'proofofwork-pool-name';
const EXPIRY_MARGIN_MS = 5000;
const MAX_TIMER_MS = 2 ** 31 - 1;
// The server grants minutes per target, so a target that already looks expired on
// arrival means the visitor's clock runs ahead. Search anyway for a while; a late
// share is answered with 410 and simply leads to the next target.
const SKEWED_CLOCK_SEARCH_MS = 30_000;
const searchTimeFor = (expiresAt, now) => {
  const left = expiresAt - EXPIRY_MARGIN_MS - now;
  return Math.min(MAX_TIMER_MS, left > 0 ? left : SKEWED_CLOCK_SEARCH_MS);
};
const UNAVAILABLE = 'The leaderboard server is unavailable right now. The simulator keeps working.';
const NAME_HINT = 'Use 3–20 characters: letters, digits or hyphens.';
const formatNumber = value => Number(value).toLocaleString('en-US');

function readName() {
  try {
    const stored = globalThis.localStorage?.getItem(NAME_KEY);
    return isValidPoolName(stored) ? stored : '';
  } catch { return ''; }
}
function storeName(name) {
  try { globalThis.localStorage?.setItem(NAME_KEY, name); } catch { /* Storage may be blocked; the name still works. */ }
}

const isAbort = error => error?.name === 'AbortError';
const isUnavailable = error => !error?.status || error.status >= 500 || error.status === 429;
// Leaves room below Number.MAX_SAFE_INTEGER for the nonces this search will try.
const randomStartNonce = () => Math.floor(Math.random() * 2 ** 52);
const emptyStats = { attempts: 0, rate: 0, accepted: 0, points: 0, bestZeros: 0 };

function zerosLabel(count) { return `${count} ${count === 1 ? 'zero' : 'zeros'}`; }

export function PoolPanel({ onClose }) {
  const [name, setName] = useState(readName);
  const [triedJoin, setTriedJoin] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [target, setTarget] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  // The last name the server refused; its message stays until the name changes.
  const [refusedName, setRefusedName] = useState('');
  const [stats, setStats] = useState(emptyStats);
  const [board, setBoard] = useState({ state: 'loading', rows: [] });
  const run = useRef(null);
  const nameValid = isValidPoolName(name);
  const showNameError = !nameValid && (triedJoin || name !== '');
  const nameRefused = nameValid && refusedName !== '' && name === refusedName;
  const joined = phase === 'connecting' || phase === 'searching' || phase === 'submitting';

  function markUnavailable() {
    run.current?.abort();
    run.current = null;
    setPhase('unavailable');
    setBoard(current => ({ ...current, state: 'unavailable' }));
  }

  async function refreshLeaderboard(signal) {
    try {
      const rows = await getLeaderboard({ signal });
      if (!signal.aborted) setBoard({ state: 'ready', rows });
      return true;
    } catch (error) {
      if (isAbort(error) || signal.aborted) return false;
      markUnavailable();
      return false;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refreshLeaderboard(controller.signal);
    return () => controller.abort();
    // Load once per opening; later refreshes follow accepted shares.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { run.current?.abort(); run.current = null; }, []);

  async function mine(minerName, controller) {
    const { signal } = controller;
    const current = () => run.current === controller && !signal.aborted;
    while (current()) {
      setPhase('connecting');
      const challenge = await getChallenge(minerName, { signal });
      if (!current()) return;
      setTarget(challenge.zeros);
      setStats(previous => ({ ...previous, attempts: 0, rate: 0 }));
      setPhase('searching');
      // One search per target; Stop, closing or the target's expiry ends it.
      const search = new AbortController();
      const abortSearch = () => search.abort();
      signal.addEventListener('abort', abortSearch, { once: true });
      const expiry = setTimeout(abortSearch, searchTimeFor(challenge.expiresAt, Date.now()));
      const started = performance.now();
      const rateAt = attempts => {
        const seconds = (performance.now() - started) / 1000;
        return seconds > 0 ? Math.round(attempts / seconds) : 0;
      };
      let result;
      try {
        result = await runSearch({
          entrants: [{ id: 'you', weight: 1, prefix: challenge.prefix, suffix: '', startNonce: randomStartNonce() }],
          target: '0'.repeat(challenge.zeros),
          signal: search.signal,
          onProgress: progress => {
            if (current()) setStats(previous => ({ ...previous, attempts: progress.attempts, rate: rateAt(progress.attempts) }));
          },
        }, { mode: 'auto' });
      } finally {
        clearTimeout(expiry);
        signal.removeEventListener('abort', abortSearch);
      }
      if (!current()) return;
      setStats(previous => ({ ...previous, attempts: result.attempts, rate: rateAt(result.attempts) }));
      // An expiring target or an exhausted range simply moves on to a fresh target.
      if (result.status !== 'found') continue;
      setPhase('submitting');
      let share;
      try {
        share = await submitShare(challenge, result.nonce, { signal });
      } catch (error) {
        if (!isAbort(error) && (error.status === 409 || error.status === 410)) continue;
        throw error;
      }
      if (!current()) return;
      setStats(previous => ({ ...previous, accepted: previous.accepted + 1, points: previous.points + share.points,
        bestZeros: Math.max(previous.bestZeros, share.zeros) }));
      if (!await refreshLeaderboard(signal)) return;
    }
  }

  function join() {
    setTriedJoin(true);
    if (!nameValid || nameRefused || joined) return;
    storeName(name);
    run.current?.abort();
    const controller = new AbortController();
    run.current = controller;
    setErrorMessage('');
    mine(name, controller).catch(error => {
      if (run.current !== controller || isAbort(error)) return;
      if (error?.code === 'name-unavailable') {
        // The server decides; show its answer next to the name and stop without retrying.
        run.current = null;
        setRefusedName(name);
        setPhase('idle');
        return;
      }
      if (isUnavailable(error)) return markUnavailable();
      run.current = null;
      setErrorMessage(error.message);
      setPhase('error');
    });
  }

  function stop() {
    run.current?.abort();
    run.current = null;
    setPhase('stopped');
  }

  let status = 'Choose a name, then join to search for shares.';
  if (phase === 'connecting') status = 'Asking the pool for a target…';
  if (phase === 'searching') status = `Searching nonces for a hash starting with ${'0'.repeat(target)}.`;
  if (phase === 'submitting') status = 'Found a share. Sending it to the pool for checking…';
  if (phase === 'stopped') status = 'Stopped. Accepted shares stay on the leaderboard.';
  if (phase === 'unavailable') status = UNAVAILABLE;
  if (phase === 'error') status = `${errorMessage} Mining stopped; you can join again.`;

  return <section className="pool-panel" aria-labelledby="pool-panel-title">
    <header className="pool-panel-header">
      <div><h2 id="pool-panel-title">Mine shares with everyone</h2>
        <p>Lend your browser to a shared pool and see how proof of work is counted.</p></div>
      <button className="btn btn-transparent" onClick={() => { if (run.current) stop(); onClose(); }}>Back to simulator</button>
    </header>

    <ul className="pool-panel-explainer">
      <li>A pool hands out a target. Your browser searches nonces until a hash meets it.</li>
      <li>The server re-checks every share with one SHA-256, so changed code cannot fake work.</li>
      <li>Each share earns the expected work of its target: 16 to the power of its zeros (65,536 points for 0000). Faster hardware finds more shares too — that is proof of work.</li>
      <li>Only the name you choose and the shares you find are stored. There is no account.</li>
    </ul>

    <div className="pool-panel-join">
      <div className="pool-panel-name">
        <label htmlFor="pool-panel-name">Name on the leaderboard</label>
        <input id="pool-panel-name" value={name} maxLength={20} autoComplete="nickname" spellCheck={false} disabled={joined}
          onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') join(); }}
          aria-invalid={showNameError || nameRefused}
          aria-describedby={showNameError || nameRefused ? 'pool-panel-name-error' : 'pool-panel-name-help'} />
        {showNameError || nameRefused
          ? <p id="pool-panel-name-error" className="pool-panel-error" role="alert">{nameRefused ? NAME_UNAVAILABLE_MESSAGE : NAME_HINT}</p>
          : <p id="pool-panel-name-help" className="pool-panel-help">{NAME_HINT} Shown publicly.</p>}
      </div>
      {joined ? <button className="btn btn-negative" onClick={stop}>Stop</button>
        : <button className="btn btn-emphasized" onClick={join}>Join</button>}
    </div>

    <p className={`pool-panel-status${phase === 'unavailable' || phase === 'error' ? ' pool-panel-status-problem' : ''}`} role="status">{status}</p>

    <dl className="pool-panel-stats">
      <div><dt>Attempts this target</dt><dd>{formatNumber(stats.attempts)}</dd></div>
      <div><dt>Hashes per second</dt><dd>{formatNumber(stats.rate)}</dd></div>
      <div><dt>Accepted shares</dt><dd>{formatNumber(stats.accepted)}</dd></div>
      <div><dt>Points this visit</dt><dd>{formatNumber(stats.points)}</dd></div>
      <div><dt>Best zeros</dt><dd>{stats.bestZeros}</dd></div>
    </dl>

    <section className="pool-panel-board" aria-labelledby="pool-panel-board-title">
      <h3 id="pool-panel-board-title">Leaderboard · top 20</h3>
      {board.state === 'loading' && <p className="pool-panel-help">Loading the leaderboard…</p>}
      {board.state === 'unavailable' && <p className="pool-panel-board-note">{UNAVAILABLE}</p>}
      {board.state === 'ready' && board.rows.length === 0 && <p className="pool-panel-help">No shares yet. Join to find the first one.</p>}
      {board.state === 'ready' && board.rows.length > 0 && <div className="pool-panel-table" tabIndex={0} role="region" aria-labelledby="pool-panel-board-title">
        <table>
          <thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Points</th><th scope="col">Shares</th><th scope="col">Best hash</th></tr></thead>
          <tbody>{board.rows.map((row, index) => <tr key={row.name}>
            <td>{index + 1}</td>
            <td className="pool-panel-cell-name">{row.name}</td>
            <td>{formatNumber(row.points)}</td>
            <td>{formatNumber(row.shares)}</td>
            <td><code>{String(row.bestHash).slice(0, 12)}</code> <span className="pool-panel-help">{zerosLabel(row.bestZeros)}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </section>;
}
