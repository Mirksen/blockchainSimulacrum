import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CoachMark } from './CoachMark';
import { KeyFigures } from './KeyFigures';
import { epochMark, upcomingOf } from './keyFigureText';
import {
  brokenBefore, candidateCopy, formatAge, formatInterval, healthSummary, linkInto, ordinal, pendingLink,
  shortHash, stateOf, statusLabel, targetZeros
} from './blockView';
import { CandidateCell, CopyButton, DownIcon, HashText, HealthCell, HealthLine, MinerMark, ShortHash } from './blockParts';
import { hint, term } from '../../lib/hints';
import './ChainBand.css';

// Chain band (web/DESIGN.md, "Chain band"): #0 … newest left to right, then the
// dashed candidate, in one row that scrolls sideways with the touchpad; hairline links,
// full-hash tooltip with Copy, key figures, and the "Chain valid" pill that opens the
// checks. Presentational: data and callbacks in props. `compact` (below 1024 px) draws
// small tiles without tooltips for the sticky band on phones and tablets.

// One shared clock for every "… ago": only the ages re-render, every few seconds.
const clock = {
  now: Math.floor(Date.now() / 1000), listeners: new Set(), timer: null,
  subscribe(listener) {
    clock.listeners.add(listener);
    if (!clock.timer) {
      clock.timer = setInterval(() => {
        clock.now = Math.floor(Date.now() / 1000);
        clock.listeners.forEach(notify => notify());
      }, 5000);
    }
    return () => {
      clock.listeners.delete(listener);
      if (!clock.listeners.size) { clearInterval(clock.timer); clock.timer = null; }
    };
  },
  read: () => clock.now
};
function Age({ time, className = 'chain-band-age' }) {
  const now = useSyncExternalStore(clock.subscribe, clock.read, clock.read);
  const text = formatAge(time, now);
  return text ? <span className={className}>{text}</span> : null;
}

/* ---------- rule changes on the chain: difficulty and halving marks ---------- */

function EpochMarks({ events }) {
  if (!events?.length) return null;
  return events.map(event => {
    const mark = epochMark(event);
    return <span key={event.kind} className={`chain-band-epoch is-${mark.kind}`} {...term('chain.change', mark)}>{mark.text}</span>;
  });
}

// Each block's time against the target: a thin bar at its foot, 0 … twice the target,
// with a tick at the target; amber when the block alone falls outside the band.
function PaceBar({ seconds, pace }) {
  if (!pace || !Number.isFinite(seconds)) return null;
  const share = Math.min(1, Math.max(0, seconds / (pace.target * 2)));
  const outside = seconds < pace.low || seconds > pace.high;
  return (
    <span className={`chain-band-pace${outside ? ' is-out' : ''}`} aria-hidden="true">
      <i style={{ width: `${share * 100}%` }} />
    </span>
  );
}

/* ---------- tile ---------- */

function tileLabel(view, { newest, selected, repairPosition, events }) {
  const parts = [view.isGenesis ? 'Genesis block 0' : `Block ${view.index}`];
  (events ?? []).forEach(event => parts.push(epochMark(event).title));
  if (newest) parts.push('newest');
  if (selected) parts.push('selected');
  if (view.status !== 'valid') parts.push(statusLabel(view.status).toLowerCase());
  if (repairPosition) parts.push(`re-mine ${ordinal(repairPosition)}`);
  if (view.status === 'hash-mismatch') {
    parts.push(`hash now ${shortHash(view.computedHash)}, ${Math.min(view.zerosNow, view.difficulty)} of ${view.difficulty} zeros; as mined ${shortHash(view.storedHash)}`);
  } else {
    parts.push(`hash ${shortHash(view.storedHash)}`);
  }
  return parts.join(', ');
}

function TipMeta({ view, views }) {
  const zeros = targetZeros(view);
  const starts = zeros ? <b>Starts with {zeros}</b> : <b>No target</b>;
  const next = views[view.index + 1];
  if (view.isGenesis) return view.anchor ? <>{starts} · built on Bitcoin block #{view.anchor.height}</> : <>{starts} · first block, no parent</>;
  switch (view.status) {
    case 'hash-mismatch':
      return <><b className="chain-band-bad">{Math.min(view.zerosNow, view.difficulty)}/{view.difficulty} zeros</b> · {next ? `#${next.index} still stores the hash as mined` : 'the stored hash no longer matches'}</>;
    case 'signature-invalid':
      return <>{starts} · <b className="chain-band-bad">a signature no longer matches</b></>;
    case 'transaction-invalid':
      return <>{starts} · <b className="chain-band-bad">a transaction breaks a rule</b></>;
    case 'link-broken':
      return <><b className="chain-band-bad">prev is not the hash of #{view.index - 1}</b></>;
    case 'built-on-broken':
      return <>{starts} · built on #{brokenBefore(views, view.index)}, which is broken</>;
    default:
      return <>{starts} · prev = hash of #{view.index - 1}</>;
  }
}

function FullHash({ hash, miss = 0 }) {
  const first = hash.slice(0, 32);
  const second = hash.slice(32);
  return (
    <span className="chain-band-tip-full">
      <span><HashText hash={first} miss={Math.min(miss, first.length)} missClass="chain-band-bad" /></span>
      <span>{second}</span>
    </span>
  );
}

function Tile({ view, views, newest, selected, pinned, repairPosition, shade, onSelect, tipEnd, events, pace }) {
  const tipId = useId();
  const [dismissed, setDismissed] = useState(false);
  const face = useRef(null);
  const state = stateOf(view);
  const mismatch = view.status === 'hash-mismatch';
  const classes = ['chain-band-tile', newest && 'is-newest', selected && (pinned ? 'is-selected' : 'is-current'),
    state === 'broken' && 'is-broken', state === 'dependent' && 'is-dependent'].filter(Boolean).join(' ');
  const tag = view.isGenesis ? 'genesis' : state === 'broken' ? statusLabel(view.status) : newest ? 'newest' : null;
  const time = view.isGenesis ? null : formatInterval(view.seconds);
  const shownHash = mismatch ? view.computedHash : view.storedHash;
  const miss = mismatch ? view.difficulty : 0;
  return (
    <div className={`${classes}${dismissed ? ' is-tip-dismissed' : ''}`} data-h={shade} data-status={view.status}
      onPointerEnter={() => setDismissed(false)} onFocusCapture={() => setDismissed(false)}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); face.current?.focus(); setDismissed(true); } }}>
      {repairPosition ? (
        <span className={`chain-band-order${repairPosition === 1 ? ' is-next' : ''}`} aria-hidden="true">{repairPosition}</span>
      ) : null}
      <span className="chain-band-num" aria-hidden="true">#{view.index}<EpochMarks events={events} /></span>
      <button ref={face} type="button" className="chain-band-tile-face" aria-pressed={selected && pinned} aria-describedby={tipId}
        aria-label={tileLabel(view, { newest, selected, repairPosition, events })} onClick={() => onSelect?.(view.index)}>
        <span className="chain-band-tile-top">
          {tag && <span className={`chain-band-tag${state === 'broken' ? ' is-bad' : ''}`}>{tag}</span>}
          {state !== 'broken' && time && <span className="chain-band-time" title={pace
            ? `Time since the previous block · target ${pace.target} s; the difficulty check averages ten blocks`
            : 'Time since the previous block'}>{time}</span>}
        </span>
        <span className="chain-band-tile-by">
          <MinerMark view={view} />
          <span className="chain-band-who">{view.minerName}</span>
          <span className="chain-band-btx">{view.txCount} tx</span>
        </span>
        {view.isGenesis ? (
          <span className="chain-band-tile-prev">{view.anchor
            ? <>prev <span className="chain-band-mono">{shortHash(view.anchor.hash)}</span> · Bitcoin #{view.anchor.height}</>
            : 'prev none · first block'}</span>
        ) : mismatch ? (
          <span className="chain-band-tile-was">as mined <s>{shortHash(view.storedHash)}</s></span>
        ) : state === 'dependent' ? (
          <span className="chain-band-tile-status">{statusLabel(view.status)}</span>
        ) : view.status === 'link-broken' ? (
          <span className="chain-band-tile-was">prev <s>{shortHash(view.prevHash)}</s> · not #{view.index - 1}</span>
        ) : (
          <span className="chain-band-tile-prev">prev <span className="chain-band-mono">{shortHash(view.prevHash)}</span> · #{view.index - 1}</span>
        )}
        <span className="chain-band-tile-foot">
          <span className="chain-band-tile-hash"><ShortHash hash={shownHash} miss={Math.min(miss, 6)} zeroClass="chain-band-lz" missClass="chain-band-lz" /></span>
          {mismatch ? (
            <span className="chain-band-meets is-bad">{Math.min(view.zerosNow, view.difficulty)}/{view.difficulty} zeros</span>
          ) : <Age time={view.time} />}
        </span>
      </button>
      {state !== 'broken' && <PaceBar seconds={view.isGenesis ? null : view.seconds} pace={pace} />}
      <div className={`chain-band-tip${tipEnd ? ' is-end' : ''}`} role="group" aria-label={`Full hash of block ${view.index}`} id={tipId}>
        <div className="chain-band-tip-head">Block #{view.index} · full hash<CopyButton text={shownHash} label={`Copy full hash of block ${view.index}`} /></div>
        {mismatch ? (
          <>
            <div className="chain-band-tip-row"><span>Now</span><FullHash hash={view.computedHash} miss={miss} /></div>
            <div className="chain-band-tip-row"><span>As mined</span><s className="chain-band-tip-was"><FullHash hash={view.storedHash} /></s></div>
          </>
        ) : (
          <FullHash hash={view.storedHash} />
        )}
        <div className="chain-band-tip-meta"><TipMeta view={view} views={views} /></div>
        {view.edited && (
          <div className="chain-band-tip-meta">Your edit: {view.edits.map(edit => `tx ${edit.txIndex + 1}: ${edit.from} → ${edit.to}`).join(', ')}</div>
        )}
      </div>
    </div>
  );
}

// Compact tile below 1024 px (web/DESIGN.md, "Screen sizes"): number, miner and short
// hash on a small block; a tap selects it like a full tile and the Block card below
// carries the details, so there is no tooltip.
function MiniTile({ view, newest, selected, pinned, repairPosition, shade, onSelect, pace }) {
  const state = stateOf(view);
  const mismatch = view.status === 'hash-mismatch';
  const classes = ['chain-band-tile', 'is-mini', newest && 'is-newest', selected && (pinned ? 'is-selected' : 'is-current'),
    state === 'broken' && 'is-broken', state === 'dependent' && 'is-dependent'].filter(Boolean).join(' ');
  const time = view.isGenesis ? null : formatInterval(view.seconds);
  const shownHash = mismatch ? view.computedHash : view.storedHash;
  return (
    <div className={classes} data-h={shade} data-status={view.status}>
      {repairPosition ? (
        <span className={`chain-band-order${repairPosition === 1 ? ' is-next' : ''}`} aria-hidden="true">{repairPosition}</span>
      ) : null}
      <button type="button" className="chain-band-tile-face" aria-pressed={selected && pinned}
        aria-label={tileLabel(view, { newest, selected, repairPosition })} onClick={() => onSelect?.(view.index)}>
        <span className="chain-band-tile-top">
          <b className="chain-band-mini-num">#{view.index}</b>
          {state === 'broken'
            ? <span className="chain-band-tag is-bad">{statusLabel(view.status)}</span>
            : view.isGenesis ? <span className="chain-band-time">genesis</span> : time && <span className="chain-band-time">{time}</span>}
        </span>
        <span className="chain-band-tile-by">
          <MinerMark view={view} />
          <span className="chain-band-who">{view.isGenesis ? 'Genesis' : view.minerName}</span>
        </span>
        <span className="chain-band-tile-hash"><ShortHash hash={shownHash} miss={mismatch ? Math.min(view.difficulty, 6) : 0} zeroClass="chain-band-lz" missClass="chain-band-lz" /></span>
      </button>
      {state !== 'broken' && <PaceBar seconds={view.isGenesis ? null : view.seconds} pace={pace} />}
    </div>
  );
}

function MiniCandidate({ candidate }) {
  const copy = candidateCopy(candidate);
  const state = candidate.state ?? 'idle';
  return (
    <div className={`chain-band-cand is-mini is-${state}`} role="group" aria-label={copy.label} aria-busy={state === 'mining' || undefined}>
      <span className="chain-band-tile-top">
        <b className="chain-band-mini-num">#{candidate.index}</b><span className="chain-band-tag">{copy.tag}</span>
      </span>
      <span className="chain-band-tile-by">{copy.tries ? <span><b>{copy.tries}</b> tries</span> : <span>{copy.what}</span>}</span>
      <span className="chain-band-time">{copy.time}</span>
      {state === 'mining' && <span className="chain-band-mine-line" aria-hidden="true" />}
    </div>
  );
}

function Link({ link, epoch = false }) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className={`chain-band-link is-${link.state}${epoch ? ' is-epoch' : ''}${dismissed ? ' is-tip-dismissed' : ''}`} role="group" tabIndex={0} aria-label={link.label}
      onPointerEnter={() => setDismissed(false)} onFocus={() => setDismissed(false)}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setDismissed(true); } }}>
      <span className="chain-band-link-dot" aria-hidden="true" />
      <span className="chain-band-ltip" role="tooltip"><b>{link.title}</b> · {link.text}</span>
    </span>
  );
}

function Candidate({ candidate, upcoming = [] }) {
  const copy = candidateCopy(candidate);
  const state = candidate.state ?? 'idle';
  const ahead = state === 'idle' || state === 'mining' ? upcoming : [];
  return (
    <div className={`chain-band-cand is-${state}`} role="group" aria-label={[copy.label, ...ahead.map(mark => mark.title)].join('; ')}
      aria-busy={state === 'mining' || undefined} {...hint('chain.candidate')}>
      <span className="chain-band-num" aria-hidden="true">#{candidate.index}</span>
      <span className="chain-band-tile-top">
        <span className="chain-band-tag">{copy.tag}</span><span className="chain-band-time">{copy.time}</span>
      </span>
      <span className="chain-band-tile-by">
        {copy.tries ? <span>{copy.what} · <b>{copy.tries}</b> tries</span> : copy.what}
      </span>
      {ahead.length > 0 && (
        <span className="chain-band-ahead" aria-hidden="true">
          {ahead.map(mark => <span key={mark.key} className={`chain-band-epoch is-${mark.kind}`} {...term('chain.change', mark)}>{mark.text}</span>)}
        </span>
      )}
      <span className="chain-band-tile-prev">
        {candidate.prevHash ? <>prev <span className="chain-band-mono">{shortHash(candidate.prevHash)}</span> · #{candidate.index - 1}</> : `on #${candidate.index - 1}`}
      </span>
      <span className="chain-band-tile-foot">
        <span className="chain-band-down">{copy.down}<DownIcon /></span>
      </span>
      {state === 'mining' && <span className="chain-band-mine-line" aria-hidden="true" />}
    </div>
  );
}

/* ---------- band ---------- */

// How close to the right edge still counts as following the newest block.
const END_SLACK = 48;

export function ChainBand({
  views = [], candidate = { index: 1, txCount: 0, state: 'idle' }, selectedIndex = null, pinned = true, onSelect,
  keyFigures, events = {}, healthOpen = false, onToggleHealth, coach = null, repairOrder = [], compact = false,
  viewSwitch = null, foundHash = null
}) {
  const stripId = useId();
  const scrollRef = useRef(null);
  const pace = keyFigures?.pace ? { low: keyFigures.pace.low, high: keyFigures.pace.high, target: keyFigures.targetSeconds } : null;
  // The row follows the newest block while it is scrolled to its end; scrolling left stops that.
  const atEnd = useRef(true);
  // True while the row scrolls itself to the newest end: its own scroll events say nothing
  // about the learner, until the learner takes over with wheel, touch, pointer or keys.
  const following = useRef(false);
  const count = views.length;
  const newestIndex = count - 1;
  const summary = healthSummary(views);
  const invalid = !summary.valid;
  const cand = { ...candidate, prevHash: candidate.prevHash ?? views[newestIndex]?.storedHash };
  // Compact cells sit under compact tiles on one line; the block card explains the details.
  const twoLine = invalid && !compact;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - END_SLACK;
    if (end) following.current = false;
    if (end || !following.current) atEnd.current = end;
  };
  const takeOver = () => { following.current = false; };
  const toEnd = smooth => {
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== 'function') return;
    atEnd.current = true;
    following.current = true;
    el.scrollTo({ left: el.scrollWidth, behavior: smooth && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'smooth' : 'auto' });
  };
  const mounted = useRef(false);
  // A new block, or letting go of a held one, brings the newest end into view.
  useLayoutEffect(() => {
    if (!pinned && atEnd.current) toEnd(mounted.current);
    mounted.current = true;
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps -- `pinned` has its own effect below
  useLayoutEffect(() => { if (!pinned) toEnd(true); }, [pinned]);
  // A resize moves the row's end; a row that was following stays on the newest block.
  useEffect(() => {
    const el = scrollRef.current;
    if (pinned || !el || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => { if (atEnd.current) toEnd(false); });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pinned]);
  // A held or repaired block that sits outside the view scrolls in.
  useLayoutEffect(() => {
    if (!pinned && !repairOrder.length) return;
    const el = scrollRef.current;
    const tile = el?.querySelector(`[data-index="${selectedIndex}"]`);
    if (!el || !tile || typeof el.scrollTo !== 'function') return;
    const left = tile.offsetLeft;
    const right = left + tile.offsetWidth;
    const behavior = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
    if (left < el.scrollLeft) el.scrollTo({ left: left - END_SLACK, behavior });
    else if (right > el.scrollLeft + el.clientWidth) el.scrollTo({ left: right - el.clientWidth + END_SLACK, behavior });
  }, [selectedIndex, pinned, repairOrder.length]);

  const shadeOf = view => {
    if (view.isGenesis) return 0;
    const age = newestIndex - view.index;
    return Math.max(1, 4 - age);
  };

  return (
    <section className={`chain-band${invalid ? ' is-invalid' : ''}${compact ? ' is-compact' : ''}`} aria-label="Chain">
      <div className="chain-band-inner">
        <div className={`chain-band-header chain-band-health${healthOpen ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}`}>
          <h2 {...term('chain.title')}>Chain</h2>
          <HealthLine summary={summary} healthOpen={healthOpen} onToggleHealth={onToggleHealth} stripId={stripId} compact={compact} />
          {!(compact && healthOpen) && <KeyFigures keyFigures={keyFigures} className="chain-band-stats" short={compact} />}
          {viewSwitch}
        </div>

        <CoachMark target="workbench.chain" coach={coach}>
          <div className="chain-band-scroll" ref={scrollRef} onScroll={onScroll}
            onWheel={takeOver} onTouchStart={takeOver} onPointerDown={takeOver} onKeyDown={takeOver}>
            <div className="chain-band-row">
              {views.map(view => {
                const position = repairOrder.indexOf(view.index) + 1;
                const tile = { view, newest: view.index === newestIndex, selected: selectedIndex === view.index, pinned,
                  repairPosition: position || null, shade: shadeOf(view), onSelect };
                return (
                  <div key={view.index} className={`chain-band-item${view.isGenesis ? ' is-first' : ''}${!view.isGenesis && view.storedHash === foundHash ? ' is-found' : ''}`} data-index={view.index}>
                    {!view.isGenesis && <Link link={linkInto(view, views[view.index - 1])} epoch={Boolean(events[view.index]?.length)} />}
                    {compact
                      ? <MiniTile {...tile} pace={pace} />
                      : <Tile {...tile} views={views} tipEnd={view.index === newestIndex && count > 1} events={events[view.index]} pace={pace} />}
                  </div>
                );
              })}
              <div className="chain-band-item is-cand">
                {count > 0 && <Link link={pendingLink(cand.index, cand.state)} epoch={Boolean(events[cand.index]?.length)} />}
                {compact ? <MiniCandidate candidate={cand} /> : <Candidate candidate={cand} upcoming={upcomingOf(keyFigures, events[cand.index])} />}
                <span className="chain-band-depth" aria-hidden="true" />
              </div>
            </div>
            {healthOpen && (
              <div className={`chain-band-row chain-band-strip${invalid ? ' is-invalid' : ''}`} id={stripId} role="list" aria-label="Checks per block">
                {views.map(view => {
                  const link = view.isGenesis ? null : linkInto(view, views[view.index - 1]);
                  return (
                    <div key={view.index} className={`chain-band-item${view.isGenesis ? ' is-first' : ''}`}>
                      {link && <span className={`chain-band-chk-link is-${link.state}`} aria-hidden="true" />}
                      <HealthCell view={view} views={views} twoLine={twoLine} />
                    </div>
                  );
                })}
                <div className="chain-band-item is-cand">
                  {count > 0 && <span className="chain-band-chk-link is-pending" aria-hidden="true" />}
                  <CandidateCell candidate={cand} twoLine={twoLine} />
                  <span className="chain-band-depth" aria-hidden="true" />
                </div>
              </div>
            )}
          </div>
        </CoachMark>
      </div>
    </section>
  );
}

export default ChainBand;
