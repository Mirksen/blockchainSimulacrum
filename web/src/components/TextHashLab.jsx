import { useEffect, useRef, useState } from 'react';
import { textHash, textTargetMet, searchText } from '../lib/textHash';
import { changedPositions } from '../lib/hashLab';
import { CoachMark } from './workbench/CoachMark';
import { hint, term } from '../lib/hints';

export function TextHashLab({ lesson, coach, onLessonEvent, onHeaders, onClose }) {
  const [text, setText] = useState('');
  const [previous, setPrevious] = useState(null);
  const [zeros, setZeros] = useState(1);
  const [proof, setProof] = useState(null);
  const [status, setStatus] = useState('idle');
  const [attempts, setAttempts] = useState(0);
  const active = useRef(null);
  const hash = textHash(text);
  const changed = changedPositions(hash, previous);
  const met = textTargetMet(hash, zeros);
  const searching = status === 'searching';

  useEffect(() => () => { const running = active.current; active.current = null; running?.abort(); }, []);

  function cancel() {
    const running = active.current;
    active.current = null;
    running?.abort();
  }
  function edit(next) {
    cancel();
    setPrevious(hash);
    setText(next);
    setStatus('idle');
    setAttempts(0);
    if (next.length && textTargetMet(textHash(next), 1) && !proof) setProof({ text: next, hash: textHash(next) });
  }
  function reset() {
    cancel();
    setText(''); setPrevious(null); setZeros(1); setProof(null); setStatus('idle'); setAttempts(0);
    onLessonEvent?.({ type: 'lesson_reset' });
  }
  async function automate() {
    cancel();
    const controller = new AbortController();
    active.current = controller;
    setStatus('searching'); setAttempts(0);
    function display(result) {
      const trial = result.entrants.text;
      setAttempts(result.attempts);
      if (trial?.nonce != null) setText(`${result.prefix}${trial.nonce}`);
    }
    try {
      const result = await searchText({ text, zeros, signal: controller.signal, onProgress: progress => {
        if (active.current === controller && !controller.signal.aborted) display(progress);
      } });
      if (active.current !== controller || controller.signal.aborted) return;
      active.current = null;
      display(result);
      setPrevious(hash);
      setStatus(result.status);
    } catch {
      if (active.current !== controller) return;
      active.current = null;
      setStatus('error');
    }
  }
  const feedback = searching ? `Trying numbers… ${attempts.toLocaleString()} hashes checked.`
    : status === 'found' ? `The computer found a match in ${attempts.toLocaleString()} ${attempts === 1 ? 'attempt' : 'attempts'}. Check the text and its hash above.`
    : status === 'stopped' ? `Stopped after ${attempts.toLocaleString()} attempts. The last text stays above.`
    : status === 'exhausted' ? 'No match in 50,000 attempts. Change the text and try again.'
    : status === 'error' ? 'The search could not finish. Your text is safe. Try again or keep editing by hand.'
    : met && text.length ? `Match: this hash starts with ${'0'.repeat(zeros)}.`
    : `Change the text until its hash starts with ${'0'.repeat(zeros)}. Try your name, then your name 1, your name 2…`;

  return <section className="hash-lab text-hash-lab" aria-labelledby="text-hash-title">
    <header className="hash-lab-header">
      <div><h2 id="text-hash-title">Mine by hand</h2>
        <p>A hash is a fingerprint of some data. Type your name and see its fingerprint.</p></div>
      <button className="btn btn-transparent" {...hint('lab.back')} onClick={() => { cancel(); onClose?.(); }}>Back to simulator</button>
    </header>
    <div className="hash-lab-workbench">
      <div className="hash-lab-inputs">
        <label htmlFor="text-hash-input">Your text</label>
        <CoachMark target="hash-lab.message" coach={coach}>
          <textarea id="text-hash-input" value={text} maxLength={1000} rows={3} placeholder="Type your name"
            aria-describedby="text-hash-help" {...hint('lab.text.input')} onChange={event => edit(event.target.value)} />
        </CoachMark>
        <p id="text-hash-help" className="hash-lab-help">Change one letter, then change it back. The original hash returns. Even spaces count.</p>
        <p className="text-hash-rule">Your challenge: make the hash start with <strong>{'0'.repeat(zeros)}</strong>.</p>
        <p className="hash-lab-help">Try adding a number: your name 1, your name 2, your name 3… There is no known shortcut to picking a matching input.</p>
      </div>
      <div className="hash-lab-output">
        <div className="hash-lab-hash-label"><h3 {...term('lab.text.hash')}>SHA-256 hash</h3>
          <span className={met ? 'hash-lab-target-met' : ''}>{met ? 'Target met' : 'Looking for ' + '0'.repeat(zeros)}</span></div>
        <div className="hash-lab-fingerprint" role="img" aria-label={`SHA-256 hash: ${hash}`}>
          {[...hash].map((character, index) => <span key={index} aria-hidden="true"
            className={[changed[index] ? 'hash-lab-changed' : '', index < zeros && hash.slice(0, index + 1) === '0'.repeat(index + 1) ? 'text-hash-zero' : ''].join(' ')}>{character}</span>)}
        </div>
        <p className="hash-lab-comparison">Always 64 characters, however long the text. The same text always gives the same hash.</p>
        <p className="hash-lab-help">Exactly the text above, hashed once with SHA-256. You can check it in any SHA-256 text tool.</p>
      </div>
    </div>
    <p className="hash-lab-feedback" role="status">{feedback}</p>
    {proof && <section className="text-hash-proof" aria-label="Your first proof of work">
      <h3>You mined by hand</h3>
      <p>You found text whose hash starts with <strong>0</strong>. Finding it took trying; checking it needs just one hash.</p>
      <details><summary {...hint('lab.text.proof')}>Your first proof</summary><pre>{proof.text}</pre><code>{proof.hash}</code></details>
      <p>The changing number is called a <span {...term('lab.text.nonce')}>nonce</span>. A miner automates these attempts.
        The required zeros set the <span {...term('lab.text.difficulty')}>difficulty</span>.</p>
      <div className="text-hash-actions">
        <button className={'btn ' + (lesson ? 'btn-default' : 'btn-emphasized')} disabled={!text.length}
          {...hint(searching ? 'lab.text.stop' : 'lab.text.automate')}
          onClick={searching ? () => { cancel(); setStatus('stopped'); } : automate}>{searching ? 'Stop trying' : 'Try automatically'}</button>
        <button className="btn btn-default" {...hint('lab.text.harder')} disabled={zeros === 2}
          onClick={() => { cancel(); setZeros(2); setStatus('idle'); setAttempts(0); }}>Try two zeros</button>
        <button className={'btn ' + (lesson ? 'btn-emphasized' : 'btn-default')} {...hint('lab.text.headers')}
          onClick={() => { cancel(); lesson ? onLessonEvent?.({ type: 'manual_hash_found', hash: proof.hash }) : onHeaders(); }}>Continue to block mining</button>
      </div>
      {zeros === 2 && <p className="hash-lab-help">Two zeros are about 16 times rarer per try than one. This is an average, not a promise about this search. Changing the target leaves the text and hash unchanged.</p>}
    </section>}
    <footer className="text-hash-actions text-hash-footer">
      <button className="btn btn-transparent" {...hint('lab.text.reset')} onClick={reset}>Reset text experiment</button>
      {!lesson && !proof && <button className="btn btn-transparent" {...hint('lab.text.headers')} onClick={onHeaders}>Explore block headers</button>}
    </footer>
  </section>;
}
