import { useEffect, useReducer, useRef } from 'react';
import { changedPositions, createTrial, findNonce, meetsTarget, parseNonce, SEARCH_LIMIT } from '../lib/hashLab';
import './HashLab.css';

const INITIAL_MESSAGE = 'Hello, block!';
const initialState = () => ({ message: INITIAL_MESSAGE, nonce: '0', difficulty: 2,
  trial: createTrial(INITIAL_MESSAGE, 0), previousHash: null, status: 'idle', attempts: 0, error: '' });

function withTrial(state, trial) {
  return { ...state, trial, previousHash: trial.hash === state.trial.hash ? state.previousHash : state.trial.hash };
}

function reducer(state, action) {
  switch (action.type) {
    case 'edit': {
      const next = { ...state, ...action.patch, status: 'idle', attempts: 0 };
      try {
        return withTrial({ ...next, error: '' }, createTrial(next.message, next.nonce));
      } catch (error) {
        return { ...next, error: error.message };
      }
    }
    case 'start': return { ...state, status: 'searching', attempts: 0 };
    case 'stopping': return { ...state, status: 'stopping' };
    case 'progress':
    case 'result': {
      const next = { ...state, attempts: action.attempts, status: action.type === 'progress' ? 'searching' : action.status };
      return action.trial ? withTrial({ ...next, nonce: String(action.trial.nonce) }, action.trial) : next;
    }
    case 'reset': return initialState();
    default: return state;
  }
}

export function HashLab({ onClose }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
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
  }
  function reset() {
    invalidateSearch();
    dispatch({ type: 'reset' });
  }
  async function search() {
    invalidateSearch();
    const controller = new AbortController();
    activeSearch.current = controller;
    dispatch({ type: 'start' });
    const result = await findNonce({ message, startNonce: parseNonce(nonce), difficulty, signal: controller.signal,
      onProgress: progress => {
        if (activeSearch.current === controller && !controller.signal.aborted) dispatch({ type: 'progress', ...progress });
      } });
    if (activeSearch.current === controller) {
      activeSearch.current = null;
      dispatch({ type: 'result', ...result });
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
      <div><h2 id="hash-lab-title">Small change. New fingerprint.</h2>
        <p>A hash is repeatable. Finding one that starts with zeros takes trial and error.</p></div>
      <button className="btn btn-transparent" onClick={() => { invalidateSearch(); onClose(); }}>Back to simulator</button>
    </header>

    <div className="hash-lab-workbench">
      <div className="hash-lab-inputs">
        <label htmlFor="hash-lab-message">Message</label>
        <textarea id="hash-lab-message" value={message} maxLength={1000} rows={3}
          onChange={event => edit({ message: event.target.value })} aria-describedby="hash-lab-message-help" />
        <p id="hash-lab-message-help" className="hash-lab-help">Try changing one character, then changing it back.</p>
        <label htmlFor="hash-lab-nonce">Nonce <span className="hash-lab-help">a number you can change</span></label>
        <div className="hash-lab-nonce-row">
          <input id="hash-lab-nonce" inputMode="numeric" value={nonce} onChange={event => edit({ nonce: event.target.value })}
            aria-invalid={!!error} aria-describedby={error ? 'hash-lab-error' : 'hash-lab-nonce-help'} />
          <button className="btn btn-default" disabled={!!error || Number(nonce) >= Number.MAX_SAFE_INTEGER}
            onClick={() => edit({ nonce: String(parseNonce(nonce) + 1) })}>Next nonce</button>
        </div>
        <p id="hash-lab-nonce-help" className="hash-lab-help">Same message + same nonce = same hash.</p>
        {error && <p id="hash-lab-error" className="hash-lab-error" role="alert">{error} The hash below keeps the last valid input.</p>}
      </div>

      <div className="hash-lab-output">
        <div className="hash-lab-hash-label"><h3>SHA-256 fingerprint</h3>
          <span className={targetMet ? 'hash-lab-target-met' : ''}>{error ? 'Waiting for valid input' : targetMet ? 'Target met' : 'Target not met'}</span></div>
        <div className="hash-lab-fingerprint" role="img" aria-label={`SHA-256 hash: ${trial.hash}`}>
          {[...trial.hash].map((character, index) => <span key={index} aria-hidden="true"
            className={changed[index] ? 'hash-lab-changed' : undefined}>{character}</span>)}
        </div>
        <p className="hash-lab-comparison">{previousHash ? <><strong>{changedCount} of 64</strong> hex characters changed from the previous displayed hash. Marked characters changed.</> : 'Each character is hexadecimal: 0–9 or a–f. Edit the input to compare fingerprints.'}</p>
        {previousHash && <details className="hash-lab-previous"><summary>Previous hash</summary><code>{previousHash}</code></details>}
      </div>
    </div>

    <div className="hash-lab-mining">
      <div><label htmlFor="hash-lab-difficulty">Find a hash starting with</label>
        <select id="hash-lab-difficulty" value={difficulty} onChange={event => edit({ difficulty: Number(event.target.value) })}>
          <option value="1">0 — one zero</option><option value="2">00 — two zeros</option><option value="3">000 — three zeros</option>
        </select>
        <p className="hash-lab-help">Each extra zero makes a match about 16 times less likely per attempt.</p></div>
      <div className="hash-lab-search-actions">
        {searching ? <button className="btn btn-negative" onClick={() => { activeSearch.current?.abort(); dispatch({ type: 'stopping' }); }}>Stop search</button>
          : <button className="btn btn-emphasized" disabled={!!error} onClick={search}>Find a nonce</button>}
        <button className="btn btn-transparent" onClick={reset}>Reset lab</button>
      </div>
    </div>
    <p className="hash-lab-feedback" role="status">{feedback}</p>
    <p className="hash-lab-help">Search starts at the displayed nonce and checks up to {SEARCH_LIMIT.toLocaleString()} candidates. Editing an input cancels the search.</p>

    <details className="hash-lab-preimage"><summary>What exactly are we hashing?</summary>
      <p>The UTF-8 text below is a JSON object with the message and numeric nonce. Punctuation and spaces inside the message count too.</p>
      <code>{trial.preimage}</code>
      <p>This lab uses a simple input. Blocks in the simulator also include transactions, a timestamp and the previous block’s hash. Your lab experiments never change the chain.</p>
    </details>
  </section>;
}
