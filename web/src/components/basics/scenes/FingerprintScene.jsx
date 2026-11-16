import { useId, useState } from 'react';
import { CoachMark } from '../../workbench/CoachMark';
import { Fingerprint } from '../Fingerprint';
import { HashGrid } from '../HashGrid';
import { hint, term } from '../../../lib/hints';
import { textHash } from '../../../lib/textHash';

// Scene 2, mission "see-a-fingerprint": type, watch the fingerprint, type the first text again.
// Events: fingerprint_made { hash } for every non-empty text change.

export function FingerprintScene({ coach, onEvent }) {
  const inputId = useId();
  const [text, setText] = useState('');
  const [first, setFirst] = useState(null);
  const [changed, setChanged] = useState(false);
  const hash = text ? textHash(text) : null;
  const again = Boolean(first && changed && hash === first.hash);

  function edit(next) {
    setText(next);
    if (!next) return;
    const nextHash = textHash(next);
    if (!first) setFirst({ text: next, hash: nextHash });
    else if (nextHash !== first.hash) setChanged(true);
    onEvent?.({ type: 'fingerprint_made', hash: nextHash });
  }

  return (
    <div className="basics-scene-body basics-fingerprint-scene">
      <div className="basics-field">
        <label htmlFor={inputId}>Your text</label>
        <CoachMark target="basics.text" coach={coach}>
          <textarea id={inputId} rows={3} maxLength={1000} value={text} placeholder="Type anything"
            {...hint('basics.text')} onChange={event => edit(event.target.value)} />
        </CoachMark>
        {first && <figure className="basics-first">
          <Fingerprint hash={first.hash} size={44} />
          <figcaption><span {...term('basics.first')}>Your first fingerprint</span>
            <q className="basics-first-text">{first.text}</q></figcaption>
        </figure>}
      </div>
      <div className="basics-output">
        {hash ? <div className="basics-print-row">
          <Fingerprint hash={hash} />
          <HashGrid hash={hash} />
        </div> : <p className="basics-empty">Type something to see its fingerprint.</p>}
        <p className="basics-quiet">Always 64 characters, for one letter or a whole book.</p>
      </div>
      <p className={`basics-status${again ? ' is-positive' : ''}`} role="status">
        {again ? 'Same text, same fingerprint.'
          : first && changed ? 'A different text, a different fingerprint. Now type your first text again.'
          : first ? 'Now change the text and watch the fingerprint.'
          : ''}
      </p>
    </div>
  );
}
