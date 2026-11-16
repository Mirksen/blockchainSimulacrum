import { useState } from 'react';
import { CoachMark } from '../../workbench/CoachMark';
import { hint } from '../../../lib/hints/basics';

// Scene 1, mission "copy-problem": sending copies data. Photo, double spend, shared list.
// Events: copy_tried { kind: 'photo' | 'double-spend' | 'rejected' }.

const PAYMENT = 'Alice → Bob · 1 coin';

// Small inline pictures of what a person holds.
const ICONS = {
  Photo: (
    <>
      <rect x="2" y="3.5" width="16" height="13" rx="2" className="basics-icon-frame" />
      <path d="M4 14.5l4.2-4.6 2.8 3 2-2 3 3.6z" className="basics-icon-hill" />
      <circle cx="13.5" cy="7.5" r="1.6" className="basics-icon-sun" />
    </>
  ),
  Coin: (
    <>
      <circle cx="10" cy="10" r="7.5" className="basics-icon-coin" />
      <circle cx="10" cy="10" r="4.6" className="basics-icon-coin-ring" />
      <path d="M10 7.4v5.2" className="basics-icon-coin-ring" />
    </>
  )
};

// What a person holds, as chips. A chip that was not there when the scene opened enters
// with a short motion (Basics.css; none with reduced motion), so the eye sees a copy
// appear. The chips are pictures; the hidden sentence says the same in words.
function Person({ name, color, items }) {
  const [opening] = useState(items);
  return (
    <li className="basics-person" style={{ '--person': `var(--${color})` }}>
      <span className="basics-person-avatar" aria-hidden="true">{name[0]}</span>
      <span className="basics-person-name">{name}</span>
      {items.length ? <span className="basics-person-items">
        <span className="basics-visually-hidden">{`Holds: ${items.join(', ')}`}</span>
        <span className="basics-chips" aria-hidden="true">
          {items.map(item => (
            <span key={item} className={`basics-chip is-${item.toLowerCase()}${opening.includes(item) ? '' : ' is-new'}`}>
              <svg viewBox="0 0 20 20" width="22" height="22" focusable="false">{ICONS[item]}</svg>
              {item}
            </span>
          ))}
        </span>
      </span> : <span className="basics-person-items is-empty">Holds nothing</span>}
    </li>
  );
}

export function CopyProblemScene({ coach, onEvent, done = false }) {
  const [photo, setPhoto] = useState(false);
  const [list, setList] = useState(false);
  const [copies, setCopies] = useState({ bob: false, carol: false });
  const [paid, setPaid] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [note, setNote] = useState(null);

  const bobHasCoin = list ? paid : copies.bob;
  const holdings = {
    alice: ['Photo', ...(list && paid ? [] : ['Coin'])],
    bob: [...(photo ? ['Photo'] : []), ...(bobHasCoin ? ['Coin'] : [])],
    carol: !list && copies.carol ? ['Coin'] : []
  };
  // The one next action the scene invites; it alone is filled.
  const next = done ? null : !photo ? 'photo'
    : !bobHasCoin ? 'bob'
    : list ? (rejected ? null : 'carol')
    : copies.carol ? null : 'carol';
  const look = action => `btn ${next === action ? 'btn-emphasized' : 'btn-default'}`;

  function sendPhoto() {
    setPhoto(true);
    setNote({ text: 'Bob got a copy. Alice still has hers.' });
    onEvent?.({ type: 'copy_tried', kind: 'photo' });
  }
  function sendToBob() {
    if (list) {
      setPaid(true);
      setNote({ text: `The shared list now says: ${PAYMENT}. The coin is Bob’s.` });
    } else {
      setCopies(current => ({ ...current, bob: true }));
      setNote({ text: 'Bob got the coin. Alice still has it, just like the photo.' });
    }
  }
  function sendToCarol() {
    if (list) {
      setRejected(true);
      setNote({ text: 'Rejected: the list says Alice already paid this coin to Bob.', kind: 'rejected' });
      onEvent?.({ type: 'copy_tried', kind: 'rejected' });
    } else {
      setCopies(current => ({ ...current, carol: true }));
      setNote({ text: 'Both got the coin, and Alice still has it. One coin became three.', kind: 'warning' });
      onEvent?.({ type: 'copy_tried', kind: 'double-spend' });
    }
  }
  function toggleList(on) {
    setList(on);
    setCopies({ bob: false, carol: false });
    setPaid(false);
    setRejected(false);
    setNote({ text: on ? 'The shared list took the copies back. Alice has her one coin again.' : 'The shared list is off. Coins are copied like photos again.' });
  }

  return (
    <div className="basics-scene-body basics-copy">
      <ul className="basics-people" aria-label="People">
        <Person name="Alice" color="alice" items={holdings.alice} />
        <Person name="Bob" color="bob" items={holdings.bob} />
        <Person name="Carol" color="chris" items={holdings.carol} />
      </ul>
      <div className="basics-actions">
        <CoachMark target="basics.copy-photo" coach={coach}>
          <span className="hint-wrap" {...hint('basics.copy.photo')}>
            <button type="button" className={look('photo')} disabled={photo} onClick={sendPhoto}>Send photo to Bob</button>
          </span>
        </CoachMark>
        <CoachMark target="basics.copy-coin" coach={coach}>
          <span className="basics-actions">
            <span className="hint-wrap" {...hint('basics.copy.coin-bob')}>
              <button type="button" className={look('bob')} disabled={bobHasCoin} onClick={sendToBob}>Send coin to Bob</button>
            </span>
            <span className="hint-wrap" {...hint('basics.copy.coin-carol')}>
              <button type="button" className={look('carol')} disabled={!bobHasCoin || (list ? rejected : copies.carol)}
                onClick={sendToCarol}>Send same coin to Carol</button>
            </span>
          </span>
        </CoachMark>
      </div>
      <p className={`basics-status${note?.kind ? ` is-${note.kind}` : ''}`} role="status">
        {note?.text ?? 'Start with the photo: send it to Bob.'}
      </p>
      <div className="basics-list-row">
        <CoachMark target="basics.copy-list" coach={coach}>
          <label className="basics-switch" {...hint('basics.copy.list')}>
            <input type="checkbox" role="switch" checked={list} onChange={event => toggleList(event.target.checked)} />
            <span>Shared list</span>
          </label>
        </CoachMark>
        <span className="basics-quiet">A picture of the idea, not a real ledger.</span>
      </div>
      {list && <section className="basics-ledger" aria-labelledby="basics-ledger-title">
        <h3 id="basics-ledger-title">Shared list: who paid whom</h3>
        {paid ? <ol><li>{PAYMENT}</li></ol> : <p className="basics-quiet">No payments yet.</p>}
      </section>}
    </div>
  );
}
