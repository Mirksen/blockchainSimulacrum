import { useId } from 'react';
import './StartChoice.css';

// The first-visit question (lib/startChoice.js). Rendered as the main content of the
// `start` view, not as a dialog: it takes no focus and traps nothing, so the top bar
// and the missions stay usable. The menu item Starting point opens it again.
const CHOICES = [
  { id: 'new', title: 'Hashes are new to me', text: 'Six short scenes, no knowledge needed. About five minutes.' },
  { id: 'hash', title: 'I know what a hash is', text: 'Skip the two fingerprint scenes and go straight to why anyone would guess hashes.' },
  { id: 'play', title: 'Just let me play', text: 'Open the simulator. The course and the missions stay one click away.' }
];

export function StartChoice({ current = null, onChoose }) {
  const titleId = useId();
  return (
    <section className="start-choice" aria-labelledby={titleId}>
      <h2 id={titleId} className="start-choice-heading">Where do you want to start?</h2>
      <ul className="start-choice-list">
        {CHOICES.map(choice => (
          <li key={choice.id}>
            {/* The beginner path is the one filled primary action of this view. */}
            <button type="button" className={`start-choice-option${choice.id === 'new' ? ' is-primary' : ''}`}
              aria-current={current === choice.id ? 'true' : undefined} onClick={() => onChoose?.(choice.id)}>
              <span className="start-choice-title">
                {choice.title}
                {current === choice.id && <>{' '}<span className="start-choice-current">current</span></>}
              </span>
              <span className="start-choice-text">{choice.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="start-choice-foot">You can change this any time in the menu under Starting point.</p>
    </section>
  );
}
