import { useEffect, useId, useState } from 'react';
import { CoachMark } from './CoachMark';
import {
  bandWindow, brokenBefore, candidateCopy, formatSeconds, healthSummary, linkInto, ordinal, pendingLink,
  shortHash, stateOf, statusLabel, zerosOf
} from './blockView';
import './ChainBand.css';

// Chain band (web/DESIGN.md, "Chain band"): #0 … newest left to right, then the
// dashed candidate; hairline links, full-hash tooltip with Copy, key-figure line
// and the collapsible chain health line. Presentational: data and callbacks in props.

const TIERS = ['a', 'b', 'c'];

/* ---------- icons (inline SVG, no emoji) ---------- */
function CheckIcon({ size = 10 }) {
  return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function CopyIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M8.5 2.5V2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>;
}
export function ChevronIcon({ className }) {
  return <svg className={className} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function DownIcon() {
  return <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function RightIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 7h10M8.5 4l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function LeftIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/* ---------- shared pieces (also used by ChainTimeline) ---------- */

// Copy with a guarded clipboard: no clipboard, no error, no "Copied".
export function CopyButton({ text, label = 'Copy full hash', className = '' }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async event => {
    event.stopPropagation();
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') return;
    try {
      await clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard refused (permissions, insecure context): the label stays "Copy".
    }
  };
  return (
    <button type="button" className={`chain-band-copy ${className}`.trim()} onClick={copy} aria-label={copied ? 'Copied' : label}>
      <CopyIcon />{copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// A hash with its leading zeros highlighted, or with the first `miss`
// characters marked as missing the target.
export function HashText({ hash, miss = 0, zeroClass = 'chain-band-zero', missClass = 'chain-band-miss' }) {
  if (miss > 0) return <><b className={missClass}>{hash.slice(0, miss)}</b>{hash.slice(miss)}</>;
  const zeros = zerosOf(hash);
  return <><b className={zeroClass}>{hash.slice(0, zeros)}</b>{hash.slice(zeros)}</>;
}

// Short hash (6 + 2) with highlighted leading zeros.
export function ShortHash({ hash, miss = 0, zeroClass, missClass }) {
  return <HashText hash={shortHash(hash)} miss={miss} zeroClass={zeroClass} missClass={missClass} />;
}

// "#2 changed after mining" with the block numbers in bold.
export function BoldBlocks({ text }) {
  return text.split(/(#\d+)/).map((part, i) => (/^#\d+$/.test(part) ? <b key={i}>{part}</b> : part));
}

export function KeyFigures({ keyFigures, className = '', short = false }) {
  if (!keyFigures) return null;
  const { avgSeconds, targetSeconds, difficulty, reward, nextHalving } = keyFigures;
  const avg = formatSeconds(avgSeconds);
  const target = formatSeconds(targetSeconds)?.replace('.0 s', ' s');
  const parts = [];
  if (avg || target) {
    parts.push(<span key="avg">{avg ? <>avg <b>{avg}</b></> : 'no blocks timed yet'}{target ? ` / target ${target}` : ''}</span>);
  }
  if (difficulty !== undefined && difficulty !== null) parts.push(<span key="d">difficulty <b>{difficulty}</b></span>);
  if (reward !== undefined && reward !== null) parts.push(<span key="r">reward <b>{reward}</b></span>);
  if (nextHalving !== undefined && nextHalving !== null) parts.push(<span key="h">{short ? 'halving' : 'next halving'} <b>#{nextHalving}</b></span>);
  return (
    <span className={className} aria-label="Key figures">
      {parts.flatMap((part, i) => (i === 0 ? [part] : [<span key={`s${i}`} className="chain-band-sep" aria-hidden="true">·</span>, part]))}
    </span>
  );
}

function targetZeros(view) {
  return view.difficulty > 0 ? '0'.repeat(view.difficulty) : null;
}

/* ---------- tile ---------- */

function tileLabel(view, { newest, selected, repairPosition }) {
  const parts = [view.isGenesis ? 'Genesis block 0' : `Block ${view.index}`];
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

function Tile({ view, views, newest, selected, repairPosition, shade, onSelect, tipEnd }) {
  const tipId = useId();
  const state = stateOf(view);
  const mismatch = view.status === 'hash-mismatch';
  const zeros = targetZeros(view);
  const classes = ['chain-band-tile', newest && 'is-newest', selected && 'is-selected',
    state === 'broken' && 'is-broken', state === 'dependent' && 'is-dependent'].filter(Boolean).join(' ');
  const tag = view.isGenesis ? 'genesis' : state === 'broken' ? statusLabel(view.status) : newest ? 'newest' : null;
  const time = view.isGenesis ? 'start' : formatSeconds(view.seconds);
  const shownHash = mismatch ? view.computedHash : view.storedHash;
  const miss = mismatch ? view.difficulty : 0;
  return (
    <div className={classes} data-h={shade} data-status={view.status}>
      {repairPosition ? (
        <span className={`chain-band-order${repairPosition === 1 ? ' is-next' : ''}`} aria-hidden="true">{repairPosition}</span>
      ) : null}
      <button type="button" className="chain-band-tile-face" aria-pressed={selected} aria-describedby={tipId}
        aria-label={tileLabel(view, { newest, selected, repairPosition })} onClick={() => onSelect?.(view.index)}>
        <span className="chain-band-tile-top">
          <b>#{view.index}</b>
          {tag && <span className={`chain-band-tag${state === 'broken' ? ' is-bad' : ''}`}>{tag}</span>}
          {state !== 'broken' && time && <span className="chain-band-time">{time}</span>}
        </span>
        <span className="chain-band-tile-by">
          <span className={`chain-band-av is-${view.minerKey}`} aria-hidden="true">{view.isGenesis ? 'G' : view.minerName.charAt(0).toUpperCase()}</span>
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
          <span className="chain-band-tile-status">Built on a broken block</span>
        ) : view.status === 'link-broken' ? (
          <span className="chain-band-tile-was">prev <s>{shortHash(view.prevHash)}</s> · not #{view.index - 1}</span>
        ) : (
          <span className="chain-band-tile-prev">prev <span className="chain-band-mono">{shortHash(view.prevHash)}</span> · #{view.index - 1}</span>
        )}
        <span className="chain-band-tile-foot">
          <span className="chain-band-tile-hash"><ShortHash hash={shownHash} miss={Math.min(miss, 6)} zeroClass="chain-band-lz" missClass="chain-band-lz" /></span>
          {mismatch ? (
            <span className="chain-band-meets is-bad">{Math.min(view.zerosNow, view.difficulty)}/{view.difficulty} zeros</span>
          ) : zeros ? (
            <span className="chain-band-meets">meets {zeros}</span>
          ) : null}
        </span>
      </button>
      <div className={`chain-band-tip${tipEnd ? ' is-end' : ''}`} role="tooltip" id={tipId}>
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

function Link({ link }) {
  return (
    <span className={`chain-band-link is-${link.state}`} tabIndex={0} aria-label={link.label}>
      <span className="chain-band-link-dot" aria-hidden="true" />
      <span className="chain-band-ltip" role="tooltip"><b>{link.title}</b> · {link.text}</span>
    </span>
  );
}

function Candidate({ candidate }) {
  const copy = candidateCopy(candidate);
  const state = candidate.state ?? 'idle';
  return (
    <div className={`chain-band-cand is-${state}`} role="group" aria-label={copy.label} aria-busy={state === 'mining' || undefined}>
      <span className="chain-band-tile-top">
        <b>#{candidate.index}</b><span className="chain-band-tag">{copy.tag}</span><span className="chain-band-time">{copy.time}</span>
      </span>
      <span className="chain-band-tile-by">
        {copy.tries ? <span>{copy.what} · <b>{copy.tries}</b> tries</span> : copy.what}
      </span>
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

/* ---------- health ---------- */

function cellFor(view, views, twoLine) {
  const zeros = targetZeros(view);
  const zeroOk = zeros ? <span className="chain-band-ok"><CheckIcon /><span className="chain-band-mono">{zeros}</span></span> : null;
  if (view.isGenesis) {
    const label = 'Block 0: genesis, no previous block';
    return twoLine
      ? { cls: 'is-ok', label, st: '#0 · valid', dt: <>genesis</> }
      : { cls: 'is-ok', label, one: <><b>#0</b><span>genesis</span></> };
  }
  const prevLink = linkInto(view, views[view.index - 1]);
  const linkWord = prevLink.state === 'dependent' ? 'link unchanged' : 'link intact';
  switch (view.status) {
    case 'hash-mismatch':
      return { cls: 'is-broken', label: `Block ${view.index}: hash mismatch, hash now ${shortHash(view.computedHash)}, ${Math.min(view.zerosNow, view.difficulty)} of ${view.difficulty} zeros`,
        st: `#${view.index} · hash mismatch`, dt: <><span className="chain-band-mono">{shortHash(view.computedHash)}</span> · {Math.min(view.zerosNow, view.difficulty)}/{view.difficulty} zeros</> };
    case 'signature-invalid':
      return { cls: 'is-broken', label: `Block ${view.index}: signature invalid; its hash and link are intact`,
        st: `#${view.index} · signature invalid`, dt: <>a transaction signature fails</> };
    case 'link-broken':
      return { cls: 'is-broken', label: `Block ${view.index}: link broken, it does not store the hash of block ${view.index - 1}`,
        st: `#${view.index} · link broken`, dt: <>prev is not the hash of #{view.index - 1}</> };
    case 'built-on-broken':
      return { cls: 'is-dependent', label: `Block ${view.index}: built on a broken block; its own hash ${zeros ? `starts with ${zeros}` : 'checks out'} and its ${linkWord}`,
        st: 'Built on a broken block', dt: <>#{view.index} · {zeroOk}{zeroOk ? ' · ' : ''}{linkWord}</> };
    default: {
      const label = `Block ${view.index}${twoLine ? ' valid' : ''}: hash ${zeros ? `starts with ${zeros}` : 'checks out'}, link to block ${view.index - 1} intact`;
      return twoLine
        ? { cls: 'is-ok', label, st: `#${view.index} · valid`, dt: <>{zeroOk}{zeroOk ? ' · ' : ''}link intact</> }
        : { cls: 'is-ok', label, one: <><b>#{view.index}</b>{zeroOk}{zeroOk && <span className="chain-band-sep">·</span>}<span className="chain-band-ok">link<CheckIcon /></span></> };
    }
  }
}

function candidateCell(candidate, twoLine) {
  const n = candidate.index;
  if (candidate.state === 'paused') {
    return { cls: 'is-pending', label: `Block ${n}: paused until the chain is valid`, st: `#${n} · paused`, dt: <>until the chain is valid</>, one: <><b>#{n}</b><span>paused</span></> };
  }
  const word = candidate.state === 'mining' ? 'being mined' : 'not mined yet';
  return twoLine
    ? { cls: 'is-pending', label: `Block ${n}: ${word}`, st: `#${n} · ${word}`, dt: <>no hash yet</> }
    : { cls: 'is-pending', label: `Block ${n}: ${word}`, one: <><b>#{n}</b><span>{word}</span></> };
}

function Cell({ cell, twoLine }) {
  return (
    <div className={`chain-band-chk ${cell.cls}${twoLine ? ' is-two' : ''}`} role="listitem" aria-label={cell.label}>
      {twoLine || !cell.one ? <><span className="chain-band-chk-st">{cell.st}</span><span className="chain-band-chk-dt">{cell.dt}</span></> : cell.one}
    </div>
  );
}

function worstCell(hidden, twoLine) {
  const first = hidden[0].index;
  const last = hidden.at(-1).index;
  const range = first === last ? `#${first}` : `#${first}–#${last}`;
  const broken = hidden.filter(view => stateOf(view) === 'broken');
  const dependent = hidden.filter(view => stateOf(view) === 'dependent');
  if (broken.length) {
    return { cls: 'is-broken', label: `Blocks ${first} to ${last}: ${broken.length} broken`, st: `${range} · ${broken.length} broken`, dt: <>show earlier blocks</>, one: <><b>{range}</b><span>{broken.length} broken</span></> };
  }
  if (dependent.length) {
    return { cls: 'is-dependent', label: `Blocks ${first} to ${last}: built on a broken block`, st: 'Built on a broken block', dt: <>{range}</>, one: <><b>{range}</b><span>built on broken</span></> };
  }
  const cell = { cls: 'is-ok', label: `Blocks ${first} to ${last} valid: hashes and links intact`, st: `${range} · valid`, dt: <><CheckIcon /> hashes · links intact</>,
    one: <><b>{range}</b><span className="chain-band-ok"><CheckIcon /></span></> };
  return twoLine ? { ...cell, one: undefined } : cell;
}

function HealthLine({ summary, healthOpen, onToggleHealth, stripId, compact = false }) {
  const { valid, minedCount, hashOk, linkOk, hashPhrase, issues } = summary;
  return (
    <div className="chain-band-health-line">
      <span className="chain-band-health-text" role="status">
        <span className="chain-band-health-sum"><i aria-hidden="true" /><b>{valid ? 'Chain valid' : 'Chain invalid'}</b></span>
        {minedCount === 0 ? (
          <><span className="chain-band-sep" aria-hidden="true">·</span><span>Genesis only · no links yet</span></>
        ) : (
          <>
            <span className="chain-band-sep" aria-hidden="true">·</span>
            <span><b>{compact ? `${hashOk}/${minedCount}` : `${hashOk} of ${minedCount}`}</b> {compact ? hashPhrase.replace('hashes start with', 'start').replace('hashes meet their target', 'meet target') : hashPhrase}</span>
            <span className="chain-band-sep" aria-hidden="true">·</span>
            {valid || compact ? (
              <span><b>{compact ? `${linkOk}/${minedCount}` : `${linkOk} of ${minedCount}`}</b> {compact ? 'links' : 'links intact'}</span>
            ) : (
              <span className="chain-band-health-issues"><BoldBlocks text={issues.join('; ')} /></span>
            )}
          </>
        )}
      </span>
      {onToggleHealth && (
        <button type="button" className="chain-band-health-toggle" aria-expanded={Boolean(healthOpen)} aria-controls={stripId} onClick={onToggleHealth}>
          {healthOpen ? 'Hide checks' : 'Show checks'}<ChevronIcon />
        </button>
      )}
    </div>
  );
}
export function HealthCell({ view, views, twoLine }) {
  return <Cell cell={cellFor(view, views, twoLine)} twoLine={twoLine} />;
}
export function CandidateCell({ candidate, twoLine }) {
  return <Cell cell={candidateCell(candidate, twoLine)} twoLine={twoLine} />;
}
export { HealthLine };

/* ---------- band ---------- */

export function ChainBand({
  views = [], candidate = { index: 1, txCount: 0, state: 'idle' }, selectedIndex = null, onSelect,
  keyFigures, healthOpen = false, onToggleHealth, coach = null, repairOrder = []
}) {
  const stripId = useId();
  const [showEarlier, setShowEarlier] = useState(false);
  const count = views.length;
  const newestIndex = count - 1;
  const summary = healthSummary(views);
  const invalid = !summary.valid;
  const windows = bandWindow(count);
  const anyHidden = TIERS.some(tier => windows[tier].hidden > 0);
  const expanded = showEarlier && anyHidden;
  const cand = { ...candidate, prevHash: candidate.prevHash ?? views[newestIndex]?.storedHash };
  const twoLine = invalid;

  const hiddenClasses = age => TIERS.filter(tier => age >= windows[tier].visible).map(tier => `is-hidden-${tier}`).join(' ');
  const rootClasses = ['chain-band', invalid && 'is-invalid', expanded && 'is-all',
    ...TIERS.filter(tier => windows[tier].hidden > 0).map(tier => `has-earlier-${tier}`)].filter(Boolean).join(' ');

  const earlierRange = tier => {
    const hidden = windows[tier].hidden;
    return hidden === 1 ? '#0' : `#0 – #${hidden - 1}`;
  };

  const shadeOf = view => {
    if (view.isGenesis) return 0;
    const age = newestIndex - view.index;
    return Math.max(1, 4 - age);
  };

  return (
    <section className={rootClasses} aria-label="Chain">
      <div className="chain-band-inner">
        <div className="chain-band-header">
          <h2>Chain</h2>
          <span className="chain-band-grows"><RightIcon />grows to the right · {count} {count === 1 ? 'block' : 'blocks'}</span>
          <span className="chain-band-sep chain-band-hint" aria-hidden="true">·</span>
          <span className="chain-band-hint">hover a block for the full hash, a link for what it checks</span>
          <KeyFigures keyFigures={keyFigures} className="chain-band-stats" />
        </div>

        <CoachMark target="workbench.chain" coach={coach}>
          <div className="chain-band-row">
            {anyHidden && (
              <div className="chain-band-item is-earlier">
                <button type="button" className="chain-band-earlier" aria-expanded={expanded} onClick={() => setShowEarlier(open => !open)}>
                  {expanded ? (
                    <><LeftIcon />Hide earlier<small>newest only</small></>
                  ) : (
                    <>
                      <LeftIcon />
                      {TIERS.map(tier => windows[tier].hidden > 0 && (
                        <span key={tier} className={`chain-band-tier-${tier}`}>
                          {windows[tier].hidden} earlier<small>{earlierRange(tier)}</small>
                        </span>
                      ))}
                    </>
                  )}
                </button>
              </div>
            )}
            {views.map(view => {
              const age = newestIndex - view.index;
              const position = repairOrder.indexOf(view.index) + 1;
              return (
                <div key={view.index} className={`chain-band-item${view.isGenesis ? ' is-first' : ''} ${hiddenClasses(age)}`.trim()}>
                  {!view.isGenesis && <Link link={linkInto(view, views[view.index - 1])} />}
                  <Tile view={view} views={views} newest={view.index === newestIndex} selected={selectedIndex === view.index}
                    repairPosition={position || null} shade={shadeOf(view)} onSelect={onSelect} tipEnd={view.index === newestIndex && count > 1} />
                </div>
              );
            })}
            <div className="chain-band-item is-cand">
              {count > 0 && <Link link={pendingLink(cand.index, cand.state)} />}
              <Candidate candidate={cand} />
              <span className="chain-band-depth" aria-hidden="true" />
            </div>
          </div>
        </CoachMark>

        <div className={`chain-band-health${healthOpen ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}`}>
          <HealthLine summary={summary} healthOpen={healthOpen} onToggleHealth={onToggleHealth} stripId={stripId} />
          {healthOpen && (
            <div className="chain-band-row chain-band-strip" id={stripId} role="list" aria-label="Checks per block">
              {anyHidden && (
                <div className="chain-band-item is-earlier">
                  {TIERS.map(tier => windows[tier].hidden > 0 && (
                    <div key={tier} className={`chain-band-earlier-cell chain-band-tier-${tier}`}>
                      <Cell cell={worstCell(views.slice(0, windows[tier].hidden), twoLine)} twoLine={twoLine} />
                    </div>
                  ))}
                </div>
              )}
              {views.map(view => {
                const age = newestIndex - view.index;
                const link = view.isGenesis ? null : linkInto(view, views[view.index - 1]);
                return (
                  <div key={view.index} className={`chain-band-item${view.isGenesis ? ' is-first' : ''} ${hiddenClasses(age)}`.trim()}>
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
      </div>
    </section>
  );
}

export default ChainBand;
