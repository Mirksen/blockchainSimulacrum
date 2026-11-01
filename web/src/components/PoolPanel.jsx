import { Fragment, useEffect, useRef, useState } from 'react';
import { le } from '../../../shared/bitcoin-block.mjs';
import { MAX_NONCE } from '../lib/blockHeader';
import { getChallenge, getLeaderboard, isValidPoolName, NAME_HINT, NAME_UNAVAILABLE_MESSAGE, submitProof } from '../lib/poolApi';
import { formatDifficulty, GENESIS, hashDifficulty, leadingZeros, poolCandidate, signatureOf, verifyRow } from '../lib/poolProof';
import { runSearch } from '../lib/powSearch';
import './PoolPanel.css';

// How long one search runs before the panel asks the pool again whether its round is still in the window.
export const ROUND_CHECK_MS = 60_000;
const UNAVAILABLE = 'The leaderboard server is unavailable right now. The simulator keeps working.';
// The first hash this page looks for; each accepted one raises the goal by a zero.
export const FIRST_GOAL_ZEROS = 5;
const formatNumber = value => Number(value).toLocaleString('en-US');
const blockLink = height => `https://mempool.space/block/${height}`;

const isAbort = error => error?.name === 'AbortError';
const isUnavailable = error => !error?.status || error.status >= 500 || error.status === 429;
const randomStartNonce = () => Math.floor(Math.random() * 2 ** 32);
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
    <p>Double SHA-256 of the 80-byte block header</p>
    <code className="pool-panel-preimage">{check.header}</code>
    <p>is <code className="pool-panel-preimage">{check.hash}</code></p>
    <p>Its coinbase commits to <code className="pool-panel-preimage">{check.commitment}</code></p>
    <p className={check.matches ? 'pool-panel-verify-ok' : 'pool-panel-error'}>
      {check.matches ? `Matches the listed hash: ${zerosLabel(row.bestZeros)}, signed by ${row.name} in round ${row.round.height}.`
        : 'Does not match the listed hash and name.'}</p>
  </div>;
}

function BoardTable({ id, rows, open, onToggle }) {
  return <div className="pool-panel-table" tabIndex={0} role="region" aria-labelledby={id}>
    <table>
      <thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Best hash</th><th scope="col">Zeros</th>
        <th scope="col">Difficulty</th><th scope="col">Blocks</th><th scope="col"><span className="pool-panel-sr">Check</span></th></tr></thead>
      <tbody>{rows.map((row, index) => {
        const key = `${id}:${row.name}-${row.bestHash}`;
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

export function PoolPanel({ name, onNameChange, onClose, onAccepted, refreshKey = 0, firstGoalZeros = FIRST_GOAL_ZEROS }) {
  const [triedJoin, setTriedJoin] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [round, setRound] = useState(null);
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
    // Load per opening and per block from the workbench; later refreshes follow accepted blocks and new rounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  useEffect(() => () => { run.current?.abort(); run.current = null; }, []);

  async function mine(minerName, controller) {
    const { signal } = controller;
    const current = () => run.current === controller && !signal.aborted;
    let active = null;
    let nonce = 0;
    let extraNonce = 0;
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
        extraNonce = 0;
        best = null;
        roundAttempts = 0;
        setRound(offer.round);
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
      const signature = signatureOf(challenge);
      const candidate = poolCandidate(signature, { time: Math.floor(Date.now() / 1000), extraNonce,
        zeros: best ? leadingZeros(best) + 1 : Math.max(challenge.minZeros, firstGoalZeros) });
      const started = performance.now();
      const rateAt = attempts => {
        const seconds = (performance.now() - started) / 1000;
        return seconds > 0 ? Math.round(attempts / seconds) : 0;
      };
      let result;
      try {
        result = await runSearch({
          entrants: [{ id: 'you', weight: 1, header: candidate.header, startNonce: nonce }],
          bits: candidate.bits,
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
      // Every 2^32 nonces of this header tried: the next extraNonce opens a fresh header.
      if (result.status === 'exhausted') {
        extraNonce += 1;
        nonce = 0;
        continue;
      }
      if (result.status !== 'found') {
        nonce = Math.min(MAX_NONCE, nonce + result.attempts);
        continue;
      }
      nonce = Math.min(MAX_NONCE, result.nonce + 1);
      setPhase('submitting');
      try {
        await submitProof(signature, { header: candidate.header + le(result.nonce, 4), coinbase: candidate.coinbase, branch: [] }, { signal });
      } catch (error) {
        if (!isAbort(error) && error.status === 410) { active = null; continue; }
        if (!isAbort(error) && error.status === 409) continue;
        throw error;
      }
      if (!current()) return;
      best = result.hash;
      setStats(previous => ({ ...previous, accepted: previous.accepted + 1, bestHash: result.hash }));
      onAccepted?.();
      if (!await refreshLeaderboard(signal)) return;
    }
  }

  function join() {
    setTriedJoin(true);
    if (!nameValid || nameRefused || joined) return;
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

  let status = 'Choose a name, then join to mine for a better hash.';
  if (phase === 'connecting') status = 'Asking the leaderboard for a round…';
  if (phase === 'searching') status = `Searching nonces for a hash that beats your best in round ${round?.height}.`;
  if (phase === 'submitting') status = 'Found a better hash. Sending the block for checking…';
  if (phase === 'stopped') status = 'Stopped. Accepted blocks stay on the leaderboard.';
  if (phase === 'unavailable') status = UNAVAILABLE;
  if (phase === 'error') status = `${errorMessage} Mining stopped; you can join again.`;

  const recent = board.recent;
  return <section className="pool-panel" aria-labelledby="pool-panel-title">
    <header className="pool-panel-header">
      <div><h2 id="pool-panel-title">Leaderboard</h2>
        <p>Every block mined under a name lands here. The best hash wins, and anyone can check it.</p></div>
      <button className="btn btn-transparent" onClick={() => { if (run.current) stop(); onClose(); }}>Back to simulator</button>
    </header>

    <section className="pool-panel-board" aria-labelledby="pool-panel-round-title">
      <h3 id="pool-panel-round-title">Last 144 blocks{recent ? <> · Bitcoin #{recent.from}–<a href={blockLink(recent.to)} target="_blank" rel="noreferrer">#{recent.to}</a></> : ''}</h3>
      {board.state === 'loading' && <p className="pool-panel-help">Loading the leaderboard…</p>}
      {board.state === 'unavailable' && <p className="pool-panel-board-note">{UNAVAILABLE}</p>}
      {board.state === 'ready' && (!recent || recent.rows.length === 0) &&
        <p className="pool-panel-help">No blocks in the last day. Mine one to lead the board.</p>}
      {board.state === 'ready' && recent?.rows.length > 0 &&
        <BoardTable id="pool-panel-round-title" rows={recent.rows} open={openRow} onToggle={setOpenRow} />}
    </section>

    <section className="pool-panel-board" aria-labelledby="pool-panel-board-title">
      <h3 id="pool-panel-board-title">All time · top 20</h3>
      {board.state === 'ready' && board.allTime.length === 0 && <p className="pool-panel-help">No blocks yet.</p>}
      {board.state === 'ready' && board.allTime.length > 0 &&
        <BoardTable id="pool-panel-board-title" rows={board.allTime} open={openRow} onToggle={setOpenRow} />}
      <p className="pool-panel-help pool-panel-genesis">Genesis <code>{GENESIS.hash.slice(0, 16)}…</code>, built on Bitcoin block {GENESIS.anchor.height}.
        {GENESIS.status === 'bridge' && ' A bridge until the final genesis is mined on 31 October 2026; the board starts again then.'}</p>
    </section>

    <h3 className="pool-panel-mine-title">Keep mining for a better hash</h3>
    <p className="pool-panel-help">The simulator's blocks are easy. Here your browser searches on its own until you stop it, always for one more zero.</p>

    <div className="pool-panel-join">
      <div className="pool-panel-name">
        <label htmlFor="pool-panel-name">Name on the leaderboard</label>
        <input id="pool-panel-name" value={name} maxLength={20} autoComplete="nickname" spellCheck={false} disabled={joined}
          onChange={event => onNameChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') join(); }}
          aria-invalid={showNameError || nameRefused}
          aria-describedby={showNameError || nameRefused ? 'pool-panel-name-error' : 'pool-panel-name-help'} />
        {showNameError || nameRefused
          ? <p id="pool-panel-name-error" className="pool-panel-error" role="alert">{nameRefused ? NAME_UNAVAILABLE_MESSAGE : NAME_HINT}</p>
          : <p id="pool-panel-name-help" className="pool-panel-help">{NAME_HINT} Shown publicly and part of every block. Names are not unique; others can mine using the same name.</p>}
      </div>
      {joined ? <button className="btn btn-negative" onClick={stop}>Stop</button>
        : <button className="btn btn-emphasized" onClick={join}>Join</button>}
    </div>

    <p className={`pool-panel-status${phase === 'unavailable' || phase === 'error' ? ' pool-panel-status-problem' : ''}`} role="status">{status}</p>

    <dl className="pool-panel-stats">
      <div><dt>Round</dt><dd>{round ? <a href={blockLink(round.height)} target="_blank" rel="noreferrer">#{round.height}</a> : '—'}</dd></div>
      <div><dt>Attempts this round</dt><dd>{formatNumber(stats.attempts)}</dd></div>
      <div><dt>Hashes per second</dt><dd>{formatNumber(stats.rate)}</dd></div>
      <div><dt>Accepted blocks</dt><dd>{formatNumber(stats.accepted)}</dd></div>
      <div><dt>Your best this round</dt><dd>{stats.bestHash
        ? `${leadingZeros(stats.bestHash)} · ${formatDifficulty(hashDifficulty(stats.bestHash))}` : '—'}</dd></div>
    </dl>

    <ul className="pool-panel-explainer">
      <li>Your name goes into the coinbase of every block you mine, and the coinbase commits to <code>genesis | round | your name</code>. Whichever miner wins, your browser did the work.</li>
      <li>The genesis hash ties the work to this chain. The round is a recent Bitcoin block: a block counts while its Bitcoin block is one of the last 144 (about a day), so nobody can mine further ahead.</li>
      <li>Most leading zeros wins. Among equal zeros, the higher difficulty (the smaller hash) is ahead.</li>
      <li>The server re-checks every block with its 80-byte header, and Verify recomputes it in your browser. Only the name you choose is stored; there is no account.</li>
    </ul>
  </section>;
}
