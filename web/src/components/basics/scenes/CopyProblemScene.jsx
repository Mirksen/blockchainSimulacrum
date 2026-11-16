import { useState } from 'react';
import { CoachMark } from '../../workbench/CoachMark';
import { hint } from '../../../lib/hints';

// Scene 1, mission "copy-problem": sending copies data. Photo, double spend, shared list.
// Events: copy_tried { kind: 'photo' | 'double-spend' | 'rejected' }.

const PAYMENT = 'Alice → Bob · 1 coin';

function Person({ name, color, items }) {
  return (
    <li className="basics-person" style={{ '--person': `var(--${color})` }}>
      <span className="basics-person-avatar" aria-hidden="true">{name[0]}</span>
      <span className="basics-person-name">{name}</span>
      <span className="basics-person-items">{items.length ? `Holds: ${items.join(', ')}` : 'Holds nothing'}</span>
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
