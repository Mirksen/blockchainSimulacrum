import { useId, useState } from 'react';
import { CoachMark } from './CoachMark';
import {
  CandidateCell, ChevronIcon, CopyButton, DownIcon, HashText, HealthCell, HealthLine, KeyFigures, ShortHash
} from './ChainBand';
import {
  brokenBefore, candidateCopy, formatSeconds, healthSummary, linkInto, ordinal, pendingLink, shortHash, stateOf, statusLabel
} from './blockView';
import './ChainTimeline.css';

// Chain as a vertical timeline for screens below 1024 px (web/DESIGN.md,
// "Screen sizes"): newest on top, the candidate
// row first, a tap opens the full hash with Copy and "Open in Chain lab".
// Same props as ChainBand plus onOpenChainLab(index).

function rowLabel(view, { newest, selected, link, repairPosition }) {
  const parts = [view.isGenesis ? 'Block 0, Genesis' : `Block ${view.index}`];
  if (newest) parts.push('newest');
  if (selected) parts.push('selected');
  if (view.status !== 'valid') parts.push(statusLabel(view.status).toLowerCase());
  if (repairPosition) parts.push(`re-mine ${ordinal(repairPosition)}`);
  if (!view.isGenesis) parts.push(view.minerName);
  parts.push(`${view.txCount} tx`);
  const time = formatSeconds(view.seconds);
  if (time) parts.push(time);
  parts.push(`hash ${shortHash(view.status === 'hash-mismatch' ? view.computedHash : view.storedHash)}`);
  if (link) parts.push(link.label.replace(/^Link (intact|unchanged|broken):.*/, `link to block ${view.index - 1} $1`));
  return parts.join(', ');
}

function FullHashLines({ hash, miss = 0 }) {
  return (
    <span className="chain-timeline-full">
      <span><HashText hash={hash.slice(0, 32)} miss={Math.min(miss, 32)} missClass="chain-band-bad" /></span>
      <span>{hash.slice(32)}</span>
    </span>
  );
}

function Details({ view, views, id, onOpenChainLab }) {
  const mismatch = view.status === 'hash-mismatch';
  const zeros = view.difficulty > 0 ? '0'.repeat(view.difficulty) : null;
  const link = view.isGenesis ? null : linkInto(view, views[view.index - 1]);
  let foot;
  if (view.isGenesis) foot = view.anchor ? <>Built on Bitcoin block #{view.anchor.height}</> : <>First block, no parent</>;
  else if (mismatch) foot = <><b className="chain-band-bad">{Math.min(view.zerosNow, view.difficulty)}/{view.difficulty} zeros</b> · stored hash no longer matches</>;
  else if (view.status === 'built-on-broken') foot = <><b className="is-dep">Built on a broken block</b> · sits on #{brokenBefore(views, view.index)}</>;
  else if (view.status === 'signature-invalid') foot = <><b className="chain-band-bad">Signature invalid</b> · hash and link intact</>;
  else if (view.status === 'transaction-invalid') foot = <><b className="chain-band-bad">Transaction invalid</b> · hash and link intact</>;
  else if (view.status === 'link-broken') foot = <><b className="chain-band-bad">Link broken</b> · prev is not the hash of #{view.index - 1}</>;
  else foot = <><b>{zeros ? `Starts with ${zeros}` : 'No target'}</b> · {link?.title.toLowerCase()} to #{view.index - 1}</>;
  return (
    <div className="chain-timeline-det" id={id}>
      <div className="chain-timeline-det-head">
        Block #{view.index} · full hash
        <CopyButton text={mismatch ? view.computedHash : view.storedHash} label={`Copy full hash of block ${view.index}`} />
      </div>
      {mismatch ? (
        <>
          <div className="chain-timeline-det-row"><span>Now</span><FullHashLines hash={view.computedHash} miss={view.difficulty} /></div>
          <div className="chain-timeline-det-row"><span>As mined</span><s><FullHashLines hash={view.storedHash} /></s></div>
        </>
      ) : (
        <FullHashLines hash={view.storedHash} />
      )}
      {view.edited && (
        <div className="chain-timeline-det-edit">Your edit: {view.edits.map(edit => `tx ${edit.txIndex + 1}: ${edit.from} → ${edit.to}`).join(', ')}</div>
      )}
      <div className="chain-timeline-det-foot">
        <span className="chain-timeline-det-check">{foot}</span>
        {onOpenChainLab && (
          <button type="button" className="chain-timeline-lab" onClick={() => onOpenChainLab(view.index)}>Open in Chain lab</button>
        )}
      </div>
    </div>
  );
}

function Row({ view, views, newest, selected, open, onTap, repairPosition, onOpenChainLab }) {
  const detId = useId();
  const state = stateOf(view);
  const link = view.isGenesis ? null : linkInto(view, views[view.index - 1]);
  const mismatch = view.status === 'hash-mismatch';
  const shade = view.isGenesis ? 0 : Math.max(1, 4 - (views.length - 1 - view.index));
  const marker = repairPosition
    ? <span className={`chain-timeline-order${repairPosition === 1 ? ' is-next' : ''}`} aria-hidden="true">{repairPosition}</span> : null;
  const classes = ['chain-timeline-row', selected && 'is-selected', state !== 'ok' && `is-${state}`,
    link && link.state !== 'ok' && `is-link-${link.state}`].filter(Boolean).join(' ');
  return (
    <li className={classes} data-h={shade}>
      <span className="chain-timeline-mark" aria-hidden="true" />
      {link && <span className={`chain-timeline-link is-${link.state}`} title={`${link.title} · ${link.text}`} aria-hidden="true" />}
      <button type="button" className="chain-timeline-sum" aria-expanded={open} aria-controls={open ? detId : undefined}
        aria-pressed={selected} aria-label={rowLabel(view, { newest, selected, link, repairPosition })} onClick={() => onTap(view.index)}>
        <span className="chain-timeline-n">#{view.index}</span>
        {state === 'ok' ? (
          <>
            <span className="chain-timeline-who">
              <span className={`chain-band-av is-${view.minerKey}`} aria-hidden="true">{view.isGenesis ? 'G' : view.minerName.charAt(0).toUpperCase()}</span>
              <span className="chain-timeline-name">{view.minerName}</span>
              {marker}
            </span>
            <span className="chain-timeline-tx">{view.txCount} tx</span>
            <span className="chain-timeline-t">{view.isGenesis ? 'start' : formatSeconds(view.seconds)}</span>
          </>
        ) : (
          <span className={`chain-timeline-status is-${state}`}>{marker}<span className="chain-timeline-status-text">{statusLabel(view.status)}</span></span>
        )}
        <span className={`chain-timeline-h${mismatch ? ' is-bad' : ''}`}>
          <ShortHash hash={mismatch ? view.computedHash : view.storedHash} miss={mismatch ? Math.min(view.difficulty, 6) : 0} zeroClass="chain-band-zero" missClass="chain-band-bad" />
        </span>
        {!view.isGenesis && (
          <span className="chain-timeline-prev">prev <span className="chain-band-mono">{shortHash(view.prevHash)}</span> · #{view.index - 1}</span>
        )}
        <ChevronIcon className="chain-timeline-chev" />
      </button>
      {open && <Details view={view} views={views} id={detId} onOpenChainLab={onOpenChainLab} />}
    </li>
  );
}

export function ChainTimeline({
  views = [], candidate = { index: 1, txCount: 0, state: 'idle' }, selectedIndex = null, onSelect, onOpenChainLab,
  keyFigures, healthOpen = false, onToggleHealth, coach = null, repairOrder = []
}) {
  const stripId = useId();
  const [openIndex, setOpenIndex] = useState(null);
  const count = views.length;
  const newestIndex = count - 1;
  const summary = healthSummary(views);
  const invalid = !summary.valid;
  const copy = candidateCopy(candidate);
  const state = candidate.state ?? 'idle';
  const pending = count > 0 ? pendingLink(candidate.index, state) : null;
  const newestFirst = [...views].reverse();

  const tap = index => {
    setOpenIndex(current => (current === index ? null : index));
    onSelect?.(index);
  };

  return (
    <section className={`chain-timeline${invalid ? ' is-invalid' : ''}`} aria-label={`Chain, ${count} ${count === 1 ? 'block' : 'blocks'}, newest on top`}>
      <div className="chain-timeline-head">
        <h2>Chain</h2>
        <span className="chain-timeline-sub">{count} {count === 1 ? 'block' : 'blocks'} · newest on top</span>
        <span className="chain-timeline-aside">tap a block for its hash</span>
      </div>
      <CoachMark target="workbench.chain" coach={coach}>
        <ol className="chain-timeline-list">
          <li className="chain-timeline-row is-cand">
            <span className="chain-timeline-mark" aria-hidden="true" />
            {pending && <span className="chain-timeline-link is-pending" title={`${pending.title} · ${pending.text}`} aria-hidden="true" />}
            <div className={`chain-timeline-cand is-${state}`} role="group" aria-label={copy.label} aria-busy={state === 'mining' || undefined}>
              <span className="chain-timeline-n">#{candidate.index}</span>
              <span className="chain-timeline-tag">{copy.tag}</span>
              <span className="chain-timeline-ctxt">{copy.tries ? <>{copy.what} · <b>{copy.tries}</b> tries</> : copy.what}</span>
              <span className="chain-timeline-cend">
                <span className="chain-timeline-ctime">{copy.time}</span>
                <span className="chain-timeline-down">{copy.down.replace(' it', '')}<DownIcon /></span>
              </span>
              {state === 'mining' && <span className="chain-timeline-mine-line" aria-hidden="true" />}
            </div>
          </li>
          {newestFirst.map(view => {
            const position = repairOrder.indexOf(view.index) + 1;
            return (
              <Row key={view.index} view={view} views={views} newest={view.index === newestIndex} selected={selectedIndex === view.index}
                open={openIndex === view.index} onTap={tap} repairPosition={position || null} onOpenChainLab={onOpenChainLab} />
            );
          })}
        </ol>
      </CoachMark>
      <div className={`chain-timeline-health chain-band-health${healthOpen ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}`}>
        <HealthLine summary={summary} healthOpen={healthOpen} onToggleHealth={onToggleHealth} stripId={stripId} compact />
        {healthOpen && (
          <div className="chain-timeline-strip" id={stripId} role="list" aria-label="Checks per block">
            <CandidateCell candidate={candidate} twoLine={invalid} />
            {newestFirst.map(view => <HealthCell key={view.index} view={view} views={views} twoLine={invalid} />)}
          </div>
        )}
      </div>
      <p className="chain-timeline-figs"><KeyFigures keyFigures={keyFigures} short /></p>
    </section>
  );
}

export default ChainTimeline;
