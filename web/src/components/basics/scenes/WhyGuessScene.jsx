import { useEffect, useRef, useState } from 'react';
import { CoachMark } from '../../workbench/CoachMark';
import { hint, term } from '../../../lib/hints/basics';
import { textHash } from '../../../lib/textHash';

// Scene 5, mission "why-guess": three writers roll in turn for the next page; the first
// fingerprint that starts with 00 wins. The whole draw is computed at once, then played
// back over one to three seconds (instantly with reduced motion).
// Events: draw_finished { winner, rolls } when a draw's result is shown.

const WRITERS = Object.freeze([
  { name: 'Hal', color: 'hal' },
  { name: 'Dorian', color: 'dorian' },
  { name: 'Laszlo', color: 'laszlo' }
]);
const PAYMENT = 'Alice pays Bob 10';
const TARGET = '00';
const ROLL_LIMIT = 200_000;

// Each page starts with the next writer, so nobody always rolls first.
function drawFor(page) {
  const order = WRITERS.map((_, index) => (index + page - 1) % WRITERS.length);
  const sequence = [];
  for (let counter = 0; sequence.length < ROLL_LIMIT; counter++) {
    for (const writer of order) {
      const hash = textHash(`Page ${page}: ${PAYMENT} · ${WRITERS[writer].name} · ${counter}`);
      sequence.push({ writer, hash });
      if (hash.startsWith(TARGET)) return { page, sequence, winner: writer };
    }
  }
  throw new Error('No winning roll found.');
}

// Per writer: rolls so far and the latest fingerprint among the first `shown` rolls.
function lanes(draw, shown) {
  const result = WRITERS.map(() => ({ rolls: 0, latest: null }));
  if (!draw) return result;
  for (const { writer, hash } of draw.sequence.slice(0, shown)) {
    result[writer].rolls += 1;
    result[writer].latest = hash;
  }
  return result;
}

const animated = () => typeof globalThis.matchMedia === 'function' &&
  !globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

const initial = { page: 1, wins: WRITERS.map(() => 0), postage: 0, last: null, running: null, shown: 0 };

function complete(state, draw) {
  return {
    ...state, page: draw.page + 1, postage: state.postage + draw.sequence.length,
    wins: state.wins.map((count, index) => count + (index === draw.winner ? 1 : 0)),
    last: draw, running: null, shown: draw.sequence.length
  };
}
const finishedEvent = draw => ({ type: 'draw_finished', winner: WRITERS[draw.winner].name, rolls: draw.sequence.length });

export function WhyGuessScene({ coach, onEvent, done = false }) {
  const [state, setState] = useState(initial);
  const report = useRef(onEvent);
  useEffect(() => { report.current = onEvent; });
  const { running } = state;

  useEffect(() => {
    if (!running) return undefined;
    const total = running.sequence.length;
    const duration = Math.min(3000, Math.max(1000, total * 10));
    let frame = 0;
    let start = null;
    const tick = now => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      if (progress < 1) {
        setState(current => ({ ...current, shown: Math.max(1, Math.floor(progress * total)) }));
        frame = requestAnimationFrame(tick);
      } else {
        setState(current => complete(current, running));
        report.current?.(finishedEvent(running));
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  function run() {
    if (running) return;
    const draw = drawFor(state.page);
    if (animated()) {
      setState(current => ({ ...current, running: draw, shown: 0 }));
    } else {
      setState(current => complete(current, draw));
      onEvent?.(finishedEvent(draw));
    }
  }

  const shownDraw = running ?? state.last;
  const current = lanes(shownDraw, running ? state.shown : shownDraw?.sequence.length ?? 0);
  const last = state.last;
  const status = running ? `Choosing a writer for page ${running.page}…`
    : last ? `${WRITERS[last.winner].name} wins page ${last.page} after ${last.sequence.length} rolls in total and writes it. Reward: 1 coin.`
    : 'Nobody has written the next page yet.';

  return (
    <div className="basics-scene-body basics-draw">
      <p className="basics-page-line">Page {running ? running.page : state.page}: {PAYMENT}</p>
      <ul className="basics-writers" aria-label="Writers">
        {WRITERS.map((writer, index) => {
          const won = !running && last?.winner === index;
          return (
            <li key={writer.name} className={`basics-writer${won ? ' is-winner' : ''}`} style={{ '--person': `var(--${writer.color})` }}>
              <span className="basics-person-avatar" aria-hidden="true">{writer.name[0]}</span>
              <span className="basics-person-name">{writer.name}{won && <span className="basics-tag"> · Winner</span>}</span>
              <span className="basics-writer-rolls">Rolls: {current[index].rolls}</span>
              <span className="basics-writer-latest">Latest: <code>{current[index].latest ? `${current[index].latest.slice(0, 6)}…` : '–'}</code></span>
              <span className="basics-writer-wins">Wins: {state.wins[index]}</span>
            </li>
          );
        })}
      </ul>
      <div className="basics-actions">
        <CoachMark target="basics.draw" coach={coach}>
          <span className="hint-wrap" {...hint('basics.draw.run')}>
            <button type="button" className={`btn ${done ? 'btn-default' : 'btn-emphasized'}`} disabled={Boolean(running)}
              onClick={run}>Run the draw</button>
          </span>
        </CoachMark>
      </div>
      <p className={`basics-status${last && !running ? ' is-positive' : ''}`} role="status">{status}</p>
      <p className="basics-count"><span {...term('basics.draw.postage')}>Postage paid</span>: {state.postage} rolls in total</p>
      <p className="basics-quiet">Hash the winning text once and check for the two leading zeros.</p>
    </div>
  );
}
