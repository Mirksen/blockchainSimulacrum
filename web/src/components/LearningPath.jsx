import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { HashLab } from './HashLab';
import { ChainLab } from './ChainLab';
import './LearningPath.css';

const STEPS = [
  { title: 'Change a fingerprint', task: 'Change the message below. Watch which characters in its hash change.',
    result: 'A small input change produces a different fingerprint. Put the original message back and its hash returns: hashing is repeatable.' },
  { title: 'Earn a proof of work', task: 'Find a nonce for one leading zero. Then choose two zeros and search again.',
    result: 'Both searches used the same message and started at nonce 0. Each extra hex zero makes a match about 16 times less likely per attempt. A single run does not guarantee a particular time or attempt ratio.' },
  { title: 'Change the past', task: 'Edit Block 1’s data. Keep that edit, then re-mine Blocks 1, 2 and 3 in order.',
    result: 'Changing an earlier block invalidates the chain. Repairing its hash changes what the next block must link to, so the repair travels forward. This toy chain shows links and work, not signatures or network consensus.' }
];
const initialState = () => ({ run: 0, step: 0, completed: [false, false, false], attempts: {}, tampered: false });

export function LearningPath({ open, onClose }) {
  const [state, setState] = useState(initialState);
  const heading = useRef(null);
  const { step, completed, attempts, tampered } = state;
  const count = completed.filter(Boolean).length;
  const firstIncomplete = completed.findIndex(done => !done);
  const unlocked = firstIncomplete === -1 ? 3 : firstIncomplete;

  function report(index, event, run) {
    setState(current => {
      if (index !== current.step || run !== current.run) return current;
      const next = { ...current, completed: [...current.completed] };
      if (event.type === 'lesson_reset') {
        next.completed[index] = false;
        if (index === 1) next.attempts = {};
        if (index === 2) next.tampered = false;
      } else if (index === 0 && event.type === 'hash_changed') next.completed[0] = true;
      else if (index === 1 && event.type === 'work_found' && [1, 2].includes(event.difficulty) && Number.isInteger(event.attempts) && event.attempts > 0) {
        next.attempts = { ...current.attempts, [event.difficulty]: event.attempts };
        next.completed[1] = !!(next.attempts[1] && next.attempts[2]);
      } else if (index === 2 && event.type === 'chain_checked') {
        if (!event.consistent && event.changedFirstBlock) next.tampered = true;
        if (current.tampered && event.consistent && event.changedFirstBlock) next.completed[2] = true;
      }
      return next;
    });
  }
  function go(index) {
    if (index > unlocked) return;
    setState(current => ({ ...current, step: index, tampered: false }));
    requestAnimationFrame(() => heading.current?.focus());
  }
  function next() {
    if (completed[step]) go(step + 1);
  }
  function restart() {
    setState(current => ({ ...initialState(), run: current.run + 1 }));
    requestAnimationFrame(() => heading.current?.focus());
  }
  function closeGuide() {
    setState(current => ({ ...current, tampered: false }));
    onClose();
  }
  if (!open) return null;

  return <Modal label="Guided learning" onClose={closeGuide}>
    <section className="learning-path" aria-labelledby="learning-title">
      <header className="learning-header">
        <div><h2 id="learning-title" ref={heading} tabIndex={-1}>{step === 3 ? 'You followed the proof.' : 'Learn by changing things.'}</h2>
          <p>Three experiments. One idea: a fingerprint connects the data to the work.</p></div>
        <button className="btn btn-transparent" onClick={closeGuide}>Close guide</button>
      </header>
      <div className="learning-progress"><progress aria-label="Learning progress" value={count} max={3} /><span>{count} of 3 experiments complete</span></div>
      <nav aria-label="Learning steps"><ol className="learning-steps">
        {STEPS.map((item, index) => <li key={item.title}><button className="learning-step" disabled={index > unlocked}
          aria-current={step === index ? 'step' : undefined} onClick={() => go(index)}>
          <span className="learning-number" aria-hidden="true">{completed[index] ? '✓' : index + 1}</span>
          <span>{item.title}{completed[index] && <span className="learning-done">Complete</span>}</span>
        </button></li>)}
      </ol></nav>
      {step < 3 ? <>
        <div className="learning-task"><h3>Experiment {step + 1}: {STEPS[step].title}</h3><p>{STEPS[step].task}</p>
          {step === 1 && <ul className="learning-checks">
            {[1, 2].map(target => <li key={target}>{attempts[target] ? `✓ ${target} ${target === 1 ? 'zero' : 'zeros'}: ${attempts[target]} attempts` : `Find a match for ${target} ${target === 1 ? 'zero' : 'zeros'}`}</li>)}
          </ul>}
          {step === 2 && <p className="learning-hint">{completed[2] ? '✓ You kept the edit and repaired the chain.' : tampered ? '✓ The edit broke consistency. Now follow the broken links forward.' : 'The starting chain is consistent. First, break it with a data edit.'}</p>}
        </div>
        <div className="learning-experiment" key={`${state.run}:${step}`}>
          {step < 2 ? <HashLab lesson={step === 0 ? 'hash' : 'work'} onLessonEvent={event => report(step, event, state.run)} />
            : <ChainLab embedded onLessonEvent={event => report(2, event, state.run)} />}
        </div>
        <div className="learning-outcome" role="status">
          {completed[step] ? <><strong>Experiment complete.</strong><p>{STEPS[step].result}</p></> : <p>Try the task above to unlock the next experiment.</p>}
        </div>
        <footer className="learning-actions">
          <button className="btn btn-transparent" disabled={step === 0} onClick={() => go(step - 1)}>Previous experiment</button>
          <button className="btn btn-emphasized" disabled={!completed[step]} onClick={next}>{step === 2 ? 'Finish learning path' : 'Next experiment'}</button>
        </footer>
      </> : <div className="learning-finish">
        <h3>From one changed character to a chain of work.</h3>
        <p>You changed a hash, searched for two targets, and repaired a chain without undoing your edit. Now try the simulator: create transactions, race miners and see how rewards change.</p>
        <p>Your guide experiments never changed the simulator’s blocks or wallets.</p>
        <button className="btn btn-emphasized" onClick={closeGuide}>Continue in simulator</button>
      </div>}
      <button className="btn btn-transparent learning-restart" onClick={restart}>Restart learning path</button>
    </section>
  </Modal>;
}
