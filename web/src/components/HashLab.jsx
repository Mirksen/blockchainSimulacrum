import { useEffect, useReducer, useRef } from 'react';
import { changedPositions, createTrial, findNonce, meetsTarget, parseNonce, SEARCH_LIMIT } from '../lib/hashLab';
import { CoachMark } from './workbench/CoachMark';
import { HeaderBytes } from './HeaderBytes';
import './HashLab.css';

const INITIAL_MESSAGE = 'Hello, block!';
const initialState = ({ difficulty = 2, comparison = null } = {}) => ({ message: INITIAL_MESSAGE, nonce: '0', difficulty,
  trial: createTrial(INITIAL_MESSAGE, 0, difficulty), previousHash: null, status: 'idle', attempts: 0, error: '', comparison });

function withTrial(state, trial) {
  return { ...state, trial, previousHash: trial.hash === state.trial.hash ? state.previousHash : state.trial.hash };
}

function reducer(state, action) {
  switch (action.type) {
    case 'edit': {
      const next = { ...state, ...action.patch, status: 'idle', attempts: 0 };
      try {
        return withTrial({ ...next, error: '' }, createTrial(next.message, next.nonce, next.difficulty));
      } catch (error) {
        return { ...next, error: error.message };
      }
    }
    case 'start': return { ...state, status: 'searching', attempts: 0 };
    case 'stopping': return { ...state, status: 'stopping' };
    case 'progress':
    case 'result': {
      const next = { ...state, attempts: action.attempts, status: action.type === 'progress' ? 'searching' : action.status,
        comparison: action.comparison ?? state.comparison };
      return action.trial ? withTrial({ ...next, nonce: String(action.trial.nonce) }, action.trial) : next;
    }
    case 'reset': return initialState({ difficulty: action.difficulty });
    default: return state;
  }
}

function SearchComparison({ comparison }) {
  if (!comparison) return null;
  return <section className="hash-lab-results" aria-label="Proof-of-work search comparison">
    <h3>Your proof-of-work searches</h3>
    <p>Recorded searches use the same message <code>{comparison.message}</code> and start at nonce {comparison.startNonce}.</p>
    <table>
      <caption>Successful searches in this experiment</caption>
      <thead><tr><th scope="col">Target</th><th scope="col">Attempts</th><th scope="col">Winning nonce</th></tr></thead>
      <tbody>{[1, 2].map(target => {
        const result = comparison.results[target];
        return <tr key={target}>
          <th scope="row">{target === 1 ? 'One zero' : 'Two zeros'} <code>({'0'.repeat(target)})</code></th>
          <td>{result ? result.attempts.toLocaleString() : 'Not found yet'}</td>
          <td>{result ? <>{result.nonce.toLocaleString()}<details><summary>Hash</summary><code>{result.hash}</code></details></> : '—'}</td>
        </tr>;
      })}</tbody>
    </table>
    <p className="hash-lab-help">Each extra hex zero makes a match about 16 times less likely per attempt. A single pair of searches does not guarantee a particular time or attempt ratio.</p>
    <p className="hash-lab-help">Results stay in this page until Reset lab or a reload. Free-play searches do not change this comparison.</p>
  </section>;
}

export function HashLab({ onClose, lesson, onLessonEvent, coach = null, workComparison = null, onWorkComparison }) {
  const [state, dispatch] = useReducer(reducer, { difficulty: lesson === 'work' ? 1 : 2, comparison: workComparison }, initialState);
  const activeSearch = useRef(null);
  useEffect(() => () => activeSearch.current?.abort(), []);

  const { message, nonce, difficulty, trial, previousHash, status, attempts, error } = state;
  const searching = status === 'searching' || status === 'stopping';
  const changed = changedPositions(trial.hash, previousHash);
  const changedCount = changed.filter(Boolean).length;
  const targetMet = !error && meetsTarget(trial.hash, difficulty);

  function invalidateSearch() {
    activeSearch.current?.abort();
    activeSearch.current = null;
  }
  function edit(patch) {
    invalidateSearch();
    dispatch({ type: 'edit', patch });
    if (lesson === 'hash' && typeof patch.message === 'string' && patch.message !== INITIAL_MESSAGE) {
      try {
        if (createTrial(patch.message, nonce, difficulty).hash !== createTrial(INITIAL_MESSAGE, nonce, difficulty).hash) {
          onLessonEvent?.({ type: 'hash_changed' });
        }
      } catch { /* An invalid nonce is not a completed experiment. */ }
    }
  }
  function reset() {
    invalidateSearch();
    dispatch({ type: 'reset', difficulty: lesson === 'work' ? 1 : 2 });
    onWorkComparison?.(null);
    onLessonEvent?.({ type: 'lesson_reset' });
  }
  async function search() {
    invalidateSearch();
    const controller = new AbortController();
    activeSearch.current = controller;
    dispatch({ type: 'start' });
    const result = await findNonce({ message, startNonce: lesson === 'work' ? 0 : parseNonce(nonce), difficulty, signal: controller.signal,
      onProgress: progress => {
        if (activeSearch.current === controller && !controller.signal.aborted) dispatch({ type: 'progress', ...progress });
      } });
    if (activeSearch.current === controller) {
      activeSearch.current = null;
      const accepted = controller.signal.aborted ? { ...result, status: 'stopped' } : result;
      const comparison = lesson === 'work' && accepted.status === 'found'
        ? { message, startNonce: 0, results: { ...state.comparison?.results,
          [difficulty]: { attempts: accepted.attempts, nonce: accepted.trial.nonce, hash: accepted.trial.hash } } }
        : state.comparison;
      dispatch({ type: 'result', ...accepted, comparison });
      if (lesson === 'work' && accepted.status === 'found') {
        // Persist before the mission event can remount this lab in free play.
        onWorkComparison?.(comparison);
        onLessonEvent?.({ type: 'work_found', difficulty, attempts: accepted.attempts });
      }
    }
  }

  let feedback = 'Change one letter. See how much of the fingerprint changes.';
  if (status === 'searching') feedback = `Searching… ${attempts.toLocaleString()} candidates checked.`;
  if (status === 'stopping') feedback = 'Stopping search…';
  if (status === 'found') feedback = `Target found after ${attempts.toLocaleString()} ${attempts === 1 ? 'attempt' : 'attempts'} in this search.`;
  if (status === 'stopped') feedback = `Stopped after ${attempts.toLocaleString()} attempts. You can keep experimenting.`;
  if (status === 'exhausted') feedback = `No match in ${attempts.toLocaleString()} attempts. Try another message or a lower target.`;

  return <section className="hash-lab" aria-labelledby="hash-lab-title">
    <header className="hash-lab-header">
      <div><h2 id="hash-lab-title">{lesson === 'work' ? 'Same input. A stricter target.' : 'Small change. New fingerprint.'}</h2>
        <p>{lesson === 'work' ? 'Compare two searches, each beginning at nonce 0.' : 'A hash is repeatable. Finding one that starts with zeros takes trial and error.'}</p></div>
      {lesson === 'hash' && <button className="btn btn-transparent" onClick={reset}>Reset lab</button>}
      {!lesson && <button className="btn btn-transparent" onClick={() => { invalidateSearch(); onClose(); }}>Back to simulator</button>}
    </header>

    <div className="hash-lab-workbench">
      <div className="hash-lab-inputs">
        <label htmlFor="hash-lab-message">Message</label>
        <CoachMark target="hash-lab.message" coach={coach}>
          <textarea id="hash-lab-message" value={message} readOnly={lesson === 'work'} maxLength={1000} rows={3}
            onChange={lesson === 'work' ? undefined : event => edit({ message: event.target.value })} aria-describedby="hash-lab-message-help" />
        </CoachMark>
        <p id="hash-lab-message-help" className="hash-lab-help">{lesson === 'work' ? 'The message is held fixed so the two searches are comparable.' : 'Try changing one character, then changing it back.'}</p>
        <label htmlFor="hash-lab-nonce">Nonce <span className="hash-lab-help">{lesson === 'work' ? 'the number the search changes' : 'a number you can change'}</span></label>
        <div className="hash-lab-nonce-row">
          <input id="hash-lab-nonce" inputMode="numeric" value={nonce} readOnly={lesson === 'work'} onChange={lesson === 'work' ? undefined : event => edit({ nonce: event.target.value })}
            aria-invalid={!!error} aria-describedby={error ? 'hash-lab-error' : 'hash-lab-nonce-help'} />
          {lesson !== 'work' && <button className="btn btn-default" disabled={!!error || Number(nonce) >= Number.MAX_SAFE_INTEGER}
            onClick={() => edit({ nonce: String(parseNonce(nonce) + 1) })}>Next nonce</button>}
        </div>
        <p id="hash-lab-nonce-help" className="hash-lab-help">Same message + same nonce = same hash.</p>
        {error && <p id="hash-lab-error" className="hash-lab-error" role="alert">{error} The hash below keeps the last valid input.</p>}
      </div>

      <div className="hash-lab-output">
        <div className="hash-lab-hash-label"><h3>Double SHA-256 fingerprint</h3>
          <span className={targetMet ? 'hash-lab-target-met' : ''}>{error ? 'Waiting for valid input' : targetMet ? 'Target met' : 'Target not met'}</span></div>
        <div className="hash-lab-fingerprint" role="img" aria-label={`Double SHA-256 hash: ${trial.hash}`}>
          {[...trial.hash].map((character, index) => <span key={index} aria-hidden="true"
            className={changed[index] ? 'hash-lab-changed' : undefined}>{character}</span>)}
        </div>
        <p className="hash-lab-comparison">{previousHash ? <><strong>{changedCount} of 64</strong> hex characters changed from the previous displayed hash. Marked characters changed.</> : 'Each character is hexadecimal: 0–9 or a–f. Edit the input to compare fingerprints.'}</p>
        {previousHash && <details className="hash-lab-previous"><summary>Previous hash</summary><code>{previousHash}</code></details>}
      </div>
    </div>

    {lesson !== 'hash' && <div className="hash-lab-mining">
      <div><label htmlFor="hash-lab-difficulty">Find a hash starting with</label>
        <select id="hash-lab-difficulty" value={difficulty} onChange={event => edit({ difficulty: Number(event.target.value), ...(lesson === 'work' ? { nonce: '0' } : {}) })}>
          <option value="1">0 — one zero</option><option value="2">00 — two zeros</option>{lesson !== 'work' && <option value="3">000 — three zeros</option>}
        </select>
        <p className="hash-lab-help">Each extra zero makes a match about 16 times less likely per attempt. The target is part of the header, so changing it changes the hash.</p></div>
      <CoachMark target="hash-lab.search" coach={coach}>
        <div className="hash-lab-search-actions">
          {searching ? <button className="btn btn-negative" onClick={() => { activeSearch.current?.abort(); dispatch({ type: 'stopping' }); }}>Stop search</button>
            : <button className="btn btn-emphasized" disabled={!!error} onClick={search}>Find a nonce</button>}
          <button className="btn btn-transparent" onClick={reset}>Reset lab</button>
        </div>
      </CoachMark>
    </div>}
    <p className="hash-lab-feedback" role="status">{feedback}</p>
    {lesson !== 'hash' && <p className="hash-lab-help">Search starts at {lesson === 'work' ? 'nonce 0' : 'the displayed nonce'} and checks up to {SEARCH_LIMIT.toLocaleString()} candidates. Editing an input cancels the search.</p>}
    <SearchComparison comparison={state.comparison} />

    <details className="hash-lab-preimage"><summary>What exactly are we hashing?</summary>
      <p>These 80 bytes are a Bitcoin block header. Your message stands in for the transactions: its double SHA-256 is the merkle root, so punctuation and spaces count too. The target fills the bits field, which is why choosing another target changes the hash.</p>
      <HeaderBytes header={trial.header} hash={trial.hash} />
      <p>Blocks in the simulator use the same 80 bytes with a real merkle root and the previous block’s hash. Your lab experiments never change the chain.</p>
    </details>
  </section>;
}
