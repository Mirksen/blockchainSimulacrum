import { useEffect, useRef, useState } from 'react';
import { linkInto, shortHash, statusLabel, targetZeros, zerosOf } from './blockView';
import { colorFor } from './minerDetailsModel';
import { hint } from '../../lib/hints';

// The parts a block is drawn with in the chain band, the chain list and the cards:
// icons, hashes, Copy, the avatar and the health checks. Components only; the texts and
// figures behind them come from blockView.js.

/* ---------- icons (inline SVG, no emoji) ---------- */
export function CheckIcon({ size = 10 }) {
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

/* ---------- Copy ---------- */

// The two looks of Copy: on the band and the list (an icon, the click stays with the
// button), and in a card (text only, with the card's hint).
const COPY_LOOKS = {
  band: { className: 'chain-band-copy', icon: true, isolated: true },
  card: { className: 'card-kit-copy', icon: false, isolated: false }
};

// Copy with a guarded clipboard: no clipboard, no error, no "Copied".
// `label` names the button, `copiedLabel` names it while it confirms.
export function CopyButton(props) {
  // A changed text starts a new lifetime, including when an earlier text returns.
  return <CopyValueButton key={props.text} {...props} />;
}

function CopyValueButton({ text, label = 'Copy full hash', copiedLabel = 'Copied', look = 'band', className = '', hintKey = null }) {
  const [copied, setCopied] = useState(null);
  const latestRequest = useRef(null);
  const style = COPY_LOOKS[look] ?? COPY_LOOKS.band;
  useEffect(() => () => { latestRequest.current = null; }, []);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(null), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async event => {
    if (style.isolated) event.stopPropagation();
    const request = {};
    latestRequest.current = request;
    setCopied(null);
    try {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') return;
      await clipboard.writeText(text);
      if (latestRequest.current === request) setCopied(request);
    } catch {
      // Clipboard refused (permissions, insecure context): the label stays "Copy".
    }
  };
  return (
    <button type="button" className={`${style.className} ${className}`.trim()} onClick={copy} aria-label={copied ? copiedLabel : label}
      {...(hintKey ? hint(hintKey) : null)}>
      {style.icon && <CopyIcon />}{copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ---------- hashes ---------- */

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

/* ---------- who ---------- */

// The round initial of a wallet or miner in its color (one rule: colorFor). Without a
// color it is drawn plain, or in `fallback` when it must always have one (miners).
export function Avatar({ name, color, colorKey, className = 'card-kit-av', fallback = null }) {
  const shown = colorFor({ color, colorKey, name }) ?? fallback;
  const style = shown ? { '--av-color': shown } : undefined;
  return <span className={`${className}${style ? '' : ' is-plain'}`} style={style} aria-hidden="true">{String(name).charAt(0).toUpperCase()}</span>;
}

// The miner initial on a band tile or list row, colored by the view's miner key.
export function MinerMark({ view }) {
  return <span className={`chain-band-av is-${view.minerKey}`} aria-hidden="true">{view.isGenesis ? 'G' : view.minerName.charAt(0).toUpperCase()}</span>;
}

/* ---------- health ---------- */

// "#2 changed after mining" with the block numbers in bold.
function BoldBlocks({ text }) {
  return text.split(/(#\d+)/).map((part, i) => (/^#\d+$/.test(part) ? <b key={i}>{part}</b> : part));
}

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
  // The status by its one name: "#2 · hash mismatch".
  const status = statusLabel(view.status);
  const named = `Block ${view.index}: ${status.toLowerCase()}`;
  const st = `#${view.index} · ${status.toLowerCase()}`;
  switch (view.status) {
    case 'hash-mismatch':
      return { cls: 'is-broken', label: `${named}, hash now ${shortHash(view.computedHash)}, ${Math.min(view.zerosNow, view.difficulty)} of ${view.difficulty} zeros`,
        st, dt: <><span className="chain-band-mono">{shortHash(view.computedHash)}</span> · {Math.min(view.zerosNow, view.difficulty)}/{view.difficulty} zeros</> };
    case 'signature-invalid':
      return { cls: 'is-broken', label: `${named}; its hash and link are intact`, st, dt: <>a transaction signature fails</> };
    case 'transaction-invalid':
      return { cls: 'is-broken', label: `${named}; its hash and link are intact`, st, dt: <>a transaction breaks a rule</> };
    case 'link-broken':
      return { cls: 'is-broken', label: `${named}, it does not store the hash of block ${view.index - 1}`,
        st, dt: <>prev is not the hash of #{view.index - 1}</> };
    case 'built-on-broken':
      return { cls: 'is-dependent', label: `${named}; its own hash ${zeros ? `starts with ${zeros}` : 'checks out'} and its ${linkWord}`,
        st: status, dt: <>#{view.index} · {zeroOk}{zeroOk ? ' · ' : ''}{linkWord}</> };
    default: {
      const label = `Block ${view.index}${twoLine ? ' valid' : ''}: hash ${zeros ? `starts with ${zeros}` : 'checks out'}, link to block ${view.index - 1} intact`;
      return twoLine
        ? { cls: 'is-ok', label, st, dt: <>{zeroOk}{zeroOk ? ' · ' : ''}link intact</> }
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

// The checks of one mined block, one line or two.
export function HealthCell({ view, views, twoLine }) {
  return <Cell cell={cellFor(view, views, twoLine)} twoLine={twoLine} />;
}

// The checks of the candidate: no hash yet.
export function CandidateCell({ candidate, twoLine }) {
  return <Cell cell={candidateCell(candidate, twoLine)} twoLine={twoLine} />;
}

// The one standing chain status: a pill. A click opens the checks behind it.
export function HealthLine({ summary, healthOpen, onToggleHealth, stripId, compact = false }) {
  const { valid, minedCount, hashOk, linkOk, hashPhrase, shortHashPhrase, issues } = summary;
  const label = valid ? 'Chain valid' : 'Chain invalid';
  const pill = <><i aria-hidden="true" /><b>{label}</b></>;
  return (
    <span className="chain-band-health-line">
      <span role="status" className="chain-band-health-status">
        {onToggleHealth ? (
          <button type="button" className="chain-band-health-sum" aria-expanded={Boolean(healthOpen)} aria-controls={stripId}
            {...hint('chain.health', valid, healthOpen)} onClick={onToggleHealth}>{pill}</button>
        ) : <span className="chain-band-health-sum" {...hint('chain.health', valid, true)}>{pill}</span>}
      </span>
      {healthOpen && (
        <span className="chain-band-health-text">
          {minedCount === 0 ? (
            <span>Genesis only · no links yet</span>
          ) : (
            <>
              <span><b>{compact ? `${hashOk}/${minedCount}` : `${hashOk} of ${minedCount}`}</b> {compact ? shortHashPhrase : hashPhrase}</span>
              <span className="chain-band-sep" aria-hidden="true">·</span>
              {valid || compact ? (
                <span><b>{compact ? `${linkOk}/${minedCount}` : `${linkOk} of ${minedCount}`}</b> {compact ? 'links' : 'links intact'}</span>
              ) : (
                <span className="chain-band-health-issues"><BoldBlocks text={issues.join('; ')} /></span>
              )}
            </>
          )}
        </span>
      )}
    </span>
  );
}
