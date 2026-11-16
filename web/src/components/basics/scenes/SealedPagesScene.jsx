import { useId, useState } from 'react';
import { CoachMark } from '../../workbench/CoachMark';
import { hint, term } from '../../../lib/hints/basics';
import { createPages, GUESSING, inspectPages, repairPages } from '../../../lib/sealedPages';

// Scene 6, mission "sealed-pages": each page is sealed together with the seal before it.
// Events: seals_checked { valid, edited } for every text edit,
//         seals_repaired { zeros, hashes, valid } for every repair.

const STATUS_TEXT = { fits: 'Seal fits', broken: 'Seal no longer fits', 'built-on-broken': 'Broken: built on a broken page' };
const GUESSING_TEXT = { 0: 'off', 2: '2 zeros', 3: '3 zeros' };
const short = seal => `${seal.slice(0, 6)}…${seal.slice(-2)}`;
const plural = (count, one, many) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

function Seal({ label, termKey, value }) {
  return (
    <div className="basics-seal">
      <dt><span {...term(termKey)}>{label}</span></dt>
      <dd><code title={value}>{short(value)}</code></dd>
    </div>
  );
}

export function SealedPagesScene({ coach, onEvent, done = false }) {
  const baseId = useId();
  const [zeros, setZeros] = useState(0);
  const [pages, setPages] = useState(() => createPages(0));
  const [repair, setRepair] = useState(null);
  const [free, setFree] = useState(null);
  const [work, setWork] = useState(null);
  const check = inspectPages(pages, zeros);
  const firstBroken = check.pages.findIndex(page => page.status !== 'fits');

  function edit(index, text) {
    const next = pages.map((page, at) => (at === index ? { ...page, text } : page));
    setPages(next);
    setRepair(null);
    onEvent?.({ type: 'seals_checked', valid: inspectPages(next, zeros).valid, edited: true });
  }
  function runRepair() {
    const result = repairPages(pages, zeros);
    setPages(result.pages);
    setRepair({ zeros, hashes: result.hashes, total: result.total });
    if (zeros === 0) setFree(result.total);
    else setWork({ zeros, total: result.total });
    onEvent?.({ type: 'seals_repaired', zeros, hashes: result.total, valid: inspectPages(result.pages, zeros).valid });
  }
  function changeZeros(value) {
    setZeros(value);
    setPages(createPages(value));
    setRepair(null);
  }

  const status = repair ? `Repaired: ${plural(repair.total, 'hash', 'hashes')} in total (${repair.hashes.join(' + ')}). All seals fit.`
    : check.valid ? 'All three seals fit.'
    : `Page ${firstBroken + 1} no longer fits its seal, and every page after it builds on it.`;

  return (
    <div className="basics-scene-body basics-sealed">
      <div className="basics-sealed-controls">
        <label htmlFor={`${baseId}-guessing`}>Guessing</label>
        <select id={`${baseId}-guessing`} value={zeros} {...hint('basics.seal.guessing')}
          onChange={event => changeZeros(Number(event.target.value))}>
          {GUESSING.map(value => <option key={value} value={value}>{GUESSING_TEXT[value]}</option>)}
        </select>
        <CoachMark target="basics.repair" coach={coach}>
          <span className="hint-wrap" {...hint('basics.seal.repair')}>
            <button type="button" className={`btn ${done ? 'btn-default' : 'btn-emphasized'}`} onClick={runRepair}>Repair</button>
          </span>
        </CoachMark>
      </div>
      <ol className="basics-pages">
        {pages.map((page, index) => {
          const { status: pageStatus, current } = check.pages[index];
          const id = `${baseId}-page-${index + 1}`;
          const field = <textarea id={id} rows={2} maxLength={200} value={page.text} {...hint('basics.seal.text', index + 1)}
            onChange={event => edit(index, event.target.value)} />;
          return (
            <li key={index} className={`basics-page is-${pageStatus}`}>
              <h3>Page {index + 1}</h3>
              <label htmlFor={id}>Page {index + 1} text</label>
              {index === 0 ? <CoachMark target="basics.page-1" coach={coach}>{field}</CoachMark> : field}
              <dl className="basics-seals">
                <div className="basics-seal">
                  <dt><span {...term('basics.seal.number')}>Lucky number</span></dt>
                  <dd><code>{page.number}</code></dd>
                </div>
                <Seal label="Previous seal" termKey="basics.seal.previous" value={page.previous} />
                <Seal label="Seal" termKey="basics.seal" value={page.seal} />
                {pageStatus === 'broken' && current !== page.seal &&
                  <Seal label="Seal of the text now" termKey="basics.seal" value={current} />}
              </dl>
              <p className="basics-page-status">{STATUS_TEXT[pageStatus]}</p>
              {repair && <p className="basics-quiet">Re-sealed in {plural(repair.hashes[index], 'hash', 'hashes')}.</p>}
            </li>
          );
        })}
      </ol>
      <p className={`basics-status${check.valid ? '' : ' is-warning'}`} role="status">{status}</p>
      {free !== null && work !== null && <p className="basics-count">
        Chain alone: repaired in {plural(free, 'hash', 'hashes')}. With work: {plural(work.total, 'try', 'tries')}.
      </p>}
    </div>
  );
}
