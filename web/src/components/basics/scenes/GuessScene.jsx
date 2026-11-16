import { useEffect, useId, useRef, useState } from 'react';
import { CoachMark } from '../../workbench/CoachMark';
import { hint, term } from '../../../lib/hints';
import { searchText, textHash } from '../../../lib/textHash';

// Scene 4, mission "change-fingerprint": roll texts until a fingerprint starts with 0.
// Every distinct non-empty text hashed is one roll, whether typed or rolled. A hit on the
// very first text is luck and does not count; a later hit is the find.
// Events: manual_hash_found { hash } once, for the find.

// "Ada" -> "Ada 1", "Ada 1" -> "Ada 2": the trailing " <number>" is replaced, as searchText does.
function nextRoll(text) {
  const match = text.match(/ (\d+)$/);
  const base = text.replace(/ \d+$/, '');
  return `${base} ${match ? (BigInt(match[1]) + 1n).toString() : '1'}`;
}

// A 16-sided die (a regular hexadecagon) showing one hex character.
function Die({ face }) {
  const points = Array.from({ length: 16 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 16 + Math.PI / 16;
    return `${(50 + 44 * Math.cos(angle)).toFixed(2)},${(50 + 44 * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
  return (
    <figure className="basics-die">
      <svg viewBox="0 0 100 100" width="88" height="88" role="img" aria-label={face ? `Die shows ${face}` : 'Die not rolled yet'}>
        <polygon points={points} className={face === '0' ? 'is-zero' : undefined} />
        <text x="50" y="52" dominantBaseline="middle" textAnchor="middle">{face ?? '?'}</text>
      </svg>
      <figcaption><span {...term('basics.guess.die')}>16-sided die</span></figcaption>
    </figure>
  );
}

export function GuessScene({ coach, onEvent, done = false }) {
  const inputId = useId();
  const [text, setText] = useState('');
  const [rolls, setRolls] = useState(0);
  const [lucky, setLucky] = useState(false);
  const [found, setFound] = useState(null);
  const [auto, setAuto] = useState({ status: 'idle', attempts: 0 });
  const seen = useRef(new Set());
  const active = useRef(null);
  const hash = text ? textHash(text) : null;
  const searching = auto.status === 'searching';

  useEffect(() => () => { const running = active.current; active.current = null; running?.abort(); }, []);

  function cancel() {
    const running = active.current;
    active.current = null;
    running?.abort();
    if (running) setAuto(current => ({ ...current, status: 'stopped' }));
  }
  function roll(next) {
    cancel();
    setText(next);
    if (!next || seen.current.has(next)) return;
    seen.current.add(next);
    const count = rolls + 1;
    setRolls(count);
    const nextHash = textHash(next);
    if (!nextHash.startsWith('0') || found) return;
    if (count === 1) { setLucky(true); return; }
    setFound({ text: next, hash: nextHash, rolls: count });
    onEvent?.({ type: 'manual_hash_found', hash: nextHash });
  }
  async function automate() {
    cancel();
    const controller = new AbortController();
    active.current = controller;
    setAuto({ status: 'searching', attempts: 0 });
    const show = result => {
      setAuto(current => ({ ...current, attempts: result.attempts }));
      const nonce = result.entrants.text?.nonce;
      if (nonce != null) setText(`${result.prefix}${nonce}`);
    };
    try {
      const result = await searchText({ text, zeros: 2, signal: controller.signal, onProgress: progress => {
        if (active.current === controller && !controller.signal.aborted) show(progress);
      } });
      if (active.current !== controller || controller.signal.aborted) return;
      active.current = null;
      show(result);
      setAuto({ status: result.status, attempts: result.attempts });
    } catch {
      if (active.current !== controller) return;
      active.current = null;
      setAuto(current => ({ ...current, status: 'error' }));
    }
  }

  const status = found ? `Found after ${found.rolls} rolls. Checking takes one look.`
    : lucky && rolls === 1 ? 'Lucky roll: 1 in 16 texts starts with 0. Roll again and find another one.'
    : !text && rolls ? 'Type a text to roll again.'
    : hash && rolls ? `Starts with ${hash[0]}, not 0. Roll again.`
    : 'Roll until the fingerprint starts with 0.';
  const attempts = auto.attempts.toLocaleString('en-US');
  const autoStatus = {
    idle: '',
    searching: `Rolling automatically… ${attempts} attempts · 256 on average.`,
    found: `Found 00 after ${attempts} attempts · 256 on average.`,
    stopped: `Stopped after ${attempts} attempts. The last text stays above.`,
    exhausted: 'No match in 50,000 attempts. Change the text and try again.',
    error: 'Rolling automatically could not finish. Your text is safe. Try again.'
  }[auto.status];

  return (
    <div className="basics-scene-body basics-guess">
      <div className="basics-field">
        <label htmlFor={inputId}>Your text</label>
        <input id={inputId} type="text" value={text} maxLength={200} placeholder="Type your name"
          {...hint('basics.guess.input')} onChange={event => roll(event.target.value)} />
        <div className="basics-actions">
          <CoachMark target="basics.guess" coach={coach}>
            <span className="hint-wrap" {...hint('basics.guess.roll')}>
              <button type="button" className={`btn ${done ? 'btn-default' : 'btn-emphasized'}`} disabled={!text}
                onClick={() => roll(nextRoll(text))}>Roll</button>
            </span>
          </CoachMark>
        </div>
      </div>
      <div className="basics-output basics-guess-output">
        <Die face={hash?.[0] ?? null} />
        <div className="basics-guess-hash">
          {hash && <code className="basics-hash-line" data-testid="guess-hash">
            <span className={hash[0] === '0' ? 'basics-zero' : 'basics-first-char'}>{hash[0]}</span>{hash.slice(1)}
          </code>}
          <p className="basics-count">Rolls: {rolls} · 16 on average</p>
        </div>
      </div>
      <p className={`basics-status${found ? ' is-positive' : ''}`} role="status">{status}</p>
      {found && <section className="basics-proof" aria-label="Your first proof">
        <details>
          <summary {...hint('basics.guess.proof')}>Your first proof</summary>
          <pre>{found.text}</pre>
          <code>{found.hash}</code>
        </details>
        <p>The changing number is called a <span {...term('basics.nonce')}>nonce</span>. Machines that roll for
          a living are called <span {...term('basics.miner')}>miners</span>.</p>
        <div className="basics-actions">
          <span className="hint-wrap" {...hint(searching ? 'basics.guess.stop' : 'basics.guess.auto')}>
            <button type="button" className="btn btn-default" disabled={!text}
              onClick={searching ? cancel : automate}>{searching ? 'Stop' : 'Roll automatically for 00'}</button>
          </span>
        </div>
        {autoStatus && <p className="basics-status" role="status">{autoStatus}</p>}
      </section>}
    </div>
  );
}
