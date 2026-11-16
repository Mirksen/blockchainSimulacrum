import { useId, useState } from 'react';
import { CoachMark } from '../../workbench/CoachMark';
import { Fingerprint } from '../Fingerprint';
import { HashGrid } from '../HashGrid';
import { hint } from '../../../lib/hints/basics';
import { textHash } from '../../../lib/textHash';
import { changedPositions } from '../../../lib/hashLab';

// Scene 3, mission "change-one-letter": a fixed text beside an editable copy.
// Events: fingerprints_compared { changed, left, right } for every change of the copy.

const ORIGINAL = 'Alice pays Bob 10';
const LEFT_HASH = textHash(ORIGINAL);

export function OneLetterScene({ coach, onEvent }) {
  const leftId = useId();
  const rightId = useId();
  const [right, setRight] = useState(ORIGINAL);
  const [lowest, setLowest] = useState(null);
  const rightHash = textHash(right);
  const marked = changedPositions(rightHash, LEFT_HASH);
  const changed = marked.filter(Boolean).length;

  function edit(next) {
    setRight(next);
    const nextHash = textHash(next);
    const count = changedPositions(nextHash, LEFT_HASH).filter(Boolean).length;
    if (count > 0) setLowest(current => (current === null ? count : Math.min(current, count)));
    onEvent?.({ type: 'fingerprints_compared', changed: count, left: LEFT_HASH, right: nextHash });
  }

  return (
    <div className="basics-scene-body basics-compare">
      <div className="basics-compare-side">
        <label htmlFor={leftId}>Original text</label>
        <input id={leftId} type="text" value={ORIGINAL} readOnly {...hint('basics.compare.left')} />
        <Fingerprint hash={LEFT_HASH} size={96} />
        <HashGrid hash={LEFT_HASH} label="Fingerprint of the original" marked={marked} small />
      </div>
      <div className="basics-compare-side">
        <label htmlFor={rightId}>Your copy</label>
        <CoachMark target="basics.compare" coach={coach}>
          <input id={rightId} type="text" value={right} maxLength={200} {...hint('basics.compare.right')}
            onChange={event => edit(event.target.value)} />
        </CoachMark>
        <Fingerprint hash={rightHash} size={96} />
        <HashGrid hash={rightHash} label="Fingerprint of your copy" marked={marked} small />
      </div>
      <div className="basics-compare-count" role="status">
        <p className="basics-count"><strong>{changed}</strong> of 64 characters differ</p>
        {lowest !== null && <p className="basics-quiet">Lowest so far: {lowest} of 64</p>}
      </div>
    </div>
  );
}
