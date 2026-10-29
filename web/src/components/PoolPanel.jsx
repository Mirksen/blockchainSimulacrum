import { Fragment, useEffect, useRef, useState } from 'react';
import { getChallenge, getLeaderboard, isValidPoolName, NAME_UNAVAILABLE_MESSAGE, submitProof } from '../lib/poolApi';
import { formatDifficulty, GENESIS, hashDifficulty, leadingZeros, verifyRow } from '../lib/poolProof';
import { runSearch } from '../lib/powSearch';
import './PoolPanel.css';

const NAME_KEY = 'proofofwork-pool-name';
// How long one search runs before the panel asks the pool again whether its round is still in the window.
export const ROUND_CHECK_MS = 60_000;
const UNAVAILABLE = 'The leaderboard server is unavailable right now. The simulator keeps working.';
const NAME_HINT = 'Use 3–20 characters: letters, digits or hyphens.';
const formatNumber = value => Number(value).toLocaleString('en-US');
const blockLink = height => `https://mempool.space/block/${height}`;

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
const emptyStats = { attempts: 0, rate: 0, accepted: 0, bestHash: null };

function zerosLabel(count) { return `${count} ${count === 1 ? 'zero' : 'zeros'}`; }

function ShortHash({ hash }) {
  const zeros = leadingZeros(hash);
  return <code><span className="pool-panel-zero">{hash.slice(0, zeros)}</span>{hash.slice(zeros, 12)}…</code>;
}

// One row's proof, recomputed in this browser from the public fields.
function Verification({ row }) {
  const check = verifyRow(row);
  return <div className="pool-panel-verify" role="status">
    <p>SHA-256 of</p>
    <code className="pool-panel-preimage">{check.preimage}</code>
    <p>is <code className="pool-panel-preimage">{check.hash}</code></p>
    <p className={check.matches ? 'pool-panel-verify-ok' : 'pool-panel-error'}>
      {check.matches ? `Matches the listed hash: ${zerosLabel(row.bestZeros)}, mined by ${row.name} in round ${row.round.height}.`
        : 'Does not match the listed hash.'}</p>
  </div>;
}

function BoardTable({ id, rows, open, onToggle }) {
  return <div className="pool-panel-table" tabIndex={0} role="region" aria-labelledby={id}>
    <table>
      <thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Best hash</th><th scope="col">Zeros</th>
        <th scope="col">Difficulty</th><th scope="col">Proofs</th><th scope="col"><span className="pool-panel-sr">Check</span></th></tr></thead>
      <tbody>{rows.map((row, index) => {
        const key = `${id}:${row.name}-${row.round.height}-${row.nonce}`;
        const isOpen = open === key;
        return <Fragment key={key}>
          <tr>
            <td>{index + 1}</td>
            <td className="pool-panel-cell-name">{row.name}</td>
            <td><ShortHash hash={row.bestHash} /></td>
            <td>{row.bestZeros}</td>
            <td>{formatDifficulty(row.difficulty)}</td>
            <td>{formatNumber(row.proofs)}</td>
            <td><button type="button" className="btn btn-transparent pool-panel-verify-btn" aria-expanded={isOpen}
              aria-label={`Verify the proof of ${row.name}`} onClick={() => onToggle(isOpen ? null : key)}>Verify</button></td>
          </tr>
          {isOpen && <tr className="pool-panel-verify-row"><td colSpan={7}><Verification row={row} /></td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
  </div>;
}

export function PoolPanel({ onClose }) {
  const [name, setName] = useState(readName);
  const [triedJoin, setTriedJoin] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [round, setRound] = useState(null);
  const [minZeros, setMinZeros] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  // The last name the server refused; its message stays until the name changes.
  const [refusedName, setRefusedName] = useState('');
  const [stats, setStats] = useState(emptyStats);
  const [board, setBoard] = useState({ state: 'loading', recent: null, allTime: [] });
  const [openRow, setOpenRow] = useState(null);
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
      const next = await getLeaderboard({ signal });
      if (!signal.aborted) setBoard({ state: 'ready', ...next });
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
    // Load once per opening; later refreshes follow accepted proofs and new rounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { run.current?.abort(); run.current = null; }, []);

  async function mine(minerName, controller) {
    const { signal } = controller;
    const current = () => run.current === controller && !signal.aborted;
    let active = null;
    let nonce = 0;
    let best = null;
    // Attempts of this round across its searches; each search counts from zero.
    let roundAttempts = 0;
    while (current()) {
      setPhase('connecting');
      const offer = await getChallenge(minerName, { signal });
      if (!current()) return;
      // A round stays minable while its Bitcoin block is in the window (the last 144
      // blocks, about a day); then the newest block starts a new round with fresh nonces.
      if (!active || active.round.height < offer.windowStart) {
        active = offer;
        nonce = randomStartNonce();
        best = null;
        roundAttempts = 0;
        setRound(offer.round);
        setMinZeros(offer.minZeros);
        setStats(previous => ({ ...previous, attempts: 0, rate: 0, bestHash: null }));
        if (!await refreshLeaderboard(signal)) return;
      }
      setPhase('searching');
      // Each search runs until a proof, Stop, or the next round check.
      const search = new AbortController();
      const abortSearch = () => search.abort();
      signal.addEventListener('abort', abortSearch, { once: true });
      const recheck = setTimeout(abortSearch, ROUND_CHECK_MS);
      const challenge = active;
      const started = performance.now();
      const rateAt = attempts => {
        const seconds = (performance.now() - started) / 1000;
        return seconds > 0 ? Math.round(attempts / seconds) : 0;
      };
      let result;
      try {
        result = await runSearch({
          entrants: [{ id: 'you', weight: 1, prefix: challenge.prefix, suffix: '', startNonce: nonce }],
          target: '0'.repeat(challenge.minZeros),
          signal: search.signal,
          onProgress: progress => {
            if (current()) setStats(previous => ({ ...previous, attempts: roundAttempts + progress.attempts, rate: rateAt(progress.attempts) }));
          },
        }, { mode: 'auto' });
      } finally {
        clearTimeout(recheck);
        signal.removeEventListener('abort', abortSearch);
      }
      if (!current()) return;
      roundAttempts += result.attempts;
      setStats(previous => ({ ...previous, attempts: roundAttempts, rate: rateAt(result.attempts) }));
      if (result.status !== 'found') {
        nonce += result.attempts;
        continue;
      }
      nonce = result.nonce + 1;
      // Only a better hash than this round's best is sent; the board keeps the best per name.
      if (best && result.hash >= best) continue;
      setPhase('submitting');
      try {
        await submitProof(challenge, result.nonce, { signal });
      } catch (error) {
        if (!isAbort(error) && error.status === 410) { active = null; continue; }
        if (!isAbort(error) && error.status === 409) continue;
        throw error;
      }
      if (!current()) return;
      best = result.hash;
      setStats(previous => ({ ...previous, accepted: previous.accepted + 1, bestHash: result.hash }));
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

  let status = 'Choose a name, then join to mine proofs.';
  if (phase === 'connecting') status = 'Asking the pool for a round…';
  if (phase === 'searching') status = `Searching nonces for a hash starting with ${'0'.repeat(minZeros ?? 1)} in round ${round?.height}.`;
  if (phase === 'submitting') status = 'Found a better hash. Sending it to the pool for checking…';
  if (phase === 'stopped') status = 'Stopped. Accepted proofs stay on the leaderboard.';
  if (phase === 'unavailable') status = UNAVAILABLE;
  if (phase === 'error') status = `${errorMessage} Mining stopped; you can join again.`;

  const recent = board.recent;
  return <section className="pool-panel" aria-labelledby="pool-panel-title">
    <header className="pool-panel-header">
      <div><h2 id="pool-panel-title">Mine proofs with everyone</h2>
        <p>Lend your browser to a shared pool. The best hash wins, and anyone can check it.</p></div>
      <button className="btn btn-transparent" onClick={() => { if (run.current) stop(); onClose(); }}>Back to simulator</button>
    </header>

    <ul className="pool-panel-explainer">
      <li>Your browser hashes <code>proofofwork.fyi | genesis | round | your name | nonce</code> until the hash starts with enough zeros.</li>
      <li>The genesis hash ties the work to this chain. The round is a recent Bitcoin block: a proof counts while its block is one of the last 144 (about a day), so nobody can mine further ahead.</li>
      <li>Most leading zeros wins. Among equal zeros, the higher difficulty (the smaller hash) is ahead.</li>
      <li>The server re-checks every proof with one SHA-256, and Verify recomputes it in your browser. Only the name you choose is stored; there is no account.</li>
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
          : <p id="pool-panel-name-help" className="pool-panel-help">{NAME_HINT} Shown publicly and part of every proof. Names are not unique; others can mine using the same name.</p>}
      </div>
      {joined ? <button className="btn btn-negative" onClick={stop}>Stop</button>
        : <button className="btn btn-emphasized" onClick={join}>Join</button>}
    </div>

    <p className={`pool-panel-status${phase === 'unavailable' || phase === 'error' ? ' pool-panel-status-problem' : ''}`} role="status">{status}</p>

    <dl className="pool-panel-stats">
      <div><dt>Round</dt><dd>{round ? <a href={blockLink(round.height)} target="_blank" rel="noreferrer">#{round.height}</a> : '—'}</dd></div>
      <div><dt>Attempts this round</dt><dd>{formatNumber(stats.attempts)}</dd></div>
      <div><dt>Hashes per second</dt><dd>{formatNumber(stats.rate)}</dd></div>
      <div><dt>Accepted proofs</dt><dd>{formatNumber(stats.accepted)}</dd></div>
      <div><dt>Your best this round</dt><dd>{stats.bestHash
        ? `${leadingZeros(stats.bestHash)} · ${formatDifficulty(hashDifficulty(stats.bestHash))}` : '—'}</dd></div>
    </dl>

    <section className="pool-panel-board" aria-labelledby="pool-panel-round-title">
      <h3 id="pool-panel-round-title">Last 144 blocks{recent ? <> · Bitcoin #{recent.from}–<a href={blockLink(recent.to)} target="_blank" rel="noreferrer">#{recent.to}</a></> : ''}</h3>
      {board.state === 'loading' && <p className="pool-panel-help">Loading the leaderboard…</p>}
      {board.state === 'unavailable' && <p className="pool-panel-board-note">{UNAVAILABLE}</p>}
      {board.state === 'ready' && (!recent || recent.rows.length === 0) &&
        <p className="pool-panel-help">No proofs in the last day. Join to find the first one.</p>}
      {board.state === 'ready' && recent?.rows.length > 0 &&
        <BoardTable id="pool-panel-round-title" rows={recent.rows} open={openRow} onToggle={setOpenRow} />}
    </section>

    <section className="pool-panel-board" aria-labelledby="pool-panel-board-title">
      <h3 id="pool-panel-board-title">All time · top 20</h3>
      {board.state === 'ready' && board.allTime.length === 0 && <p className="pool-panel-help">No proofs yet.</p>}
      {board.state === 'ready' && board.allTime.length > 0 &&
        <BoardTable id="pool-panel-board-title" rows={board.allTime} open={openRow} onToggle={setOpenRow} />}
      <p className="pool-panel-help pool-panel-genesis">Genesis <code>{GENESIS.hash.slice(0, 16)}…</code>, built on Bitcoin block {GENESIS.anchor.height}.
        {GENESIS.status === 'bridge' && ' A bridge until the final genesis is mined on 31 October 2026; the board starts again then.'}</p>
    </section>
  </section>;
}
