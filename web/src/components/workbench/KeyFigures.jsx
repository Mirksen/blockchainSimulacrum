import { useEffect, useRef, useState } from 'react';
import { formatSeconds } from './blockView';
import { CHECK_EVERY } from '../../lib/difficulty';
import { forecastOf, formatReward, whole } from './keyFigureText';
import { term } from '../../lib/hints';
import './KeyFigures.css';

// Key figures (web/DESIGN.md, "Key figures"): the rules the chain follows, with what
// they will do next. The pace is the average the next difficulty check measures, set
// against the band that keeps the difficulty; the reward names its next halving.
// Shared by the chain band header, the phone timeline and the sticky bar.

// Where the measured pace sits: a track from 0 to twice the target, the band that keeps
// the difficulty, a tick at the target and a marker for the average (amber outside the band).
export function PaceMeter({ figures, className = '' }) {
  const { pace, targetSeconds } = figures;
  const span = targetSeconds * 2;
  const at = value => `${Math.min(100, Math.max(0, (value / span) * 100))}%`;
  const outside = pace.seconds !== null && (pace.seconds < pace.low || pace.seconds > pace.high);
  return (
    <span className={`kf-meter ${className}`.trim()} aria-hidden="true">
      <span className="kf-meter-band" style={{ left: at(pace.low), width: `calc(${at(pace.high)} - ${at(pace.low)})` }} />
      <span className="kf-meter-tick" style={{ left: at(targetSeconds) }} />
      {pace.seconds !== null && <span className={`kf-meter-mark${outside ? ' is-out' : ''}`} style={{ left: at(pace.seconds) }} />}
    </span>
  );
}

function paceText(figures, short) {
  const { pace, targetSeconds, check } = figures;
  const target = whole(targetSeconds);
  if (pace.seconds === null) {
    const since = check.at > CHECK_EVERY ? `since #${check.at - CHECK_EVERY}` : 'yet';
    return <>{short ? 'no pace yet' : `no block timed ${since}`} · target {target}</>;
  }
  return short
    ? <><b>{formatSeconds(pace.seconds)}</b> / {target}</>
    : <>last {pace.blocks} avg <b>{formatSeconds(pace.seconds)}</b> / target {target}</>;
}

function checkText(figures, short) {
  const { difficulty, check, pace } = figures;
  const forecast = forecastOf(figures);
  const head = short ? <>diff <b>{difficulty}</b></> : <>difficulty <b>{difficulty}</b></>;
  const at = short ? 'at' : 'after';
  if (pace.seconds === null) return <>{head} · check {at} #{check.at}</>;
  if (forecast === 'stays') return short ? <>{head} stays at #{check.at}</> : <>{head} → stays after #{check.at}</>;
  return <>{head} → <b className={`kf-${forecast}`}>{check.next}</b> {at} #{check.at}</>;
}

function rewardText(figures, short) {
  const { reward, halving } = figures;
  const when = halving.in === 1 ? 'next block' : short ? `in ${halving.in}` : `in ${halving.in} blocks`;
  if (short) return <>½ {when}</>;
  return <>reward <b>{formatReward(reward)}</b> → {formatReward(halving.reward)} {when}</>;
}

export function KeyFigures({ keyFigures, className = '', short = false, label = 'Key figures' }) {
  if (!keyFigures?.pace) return null;
  const { pace, targetSeconds, check, halving, halvingInterval, difficulty } = keyFigures;
  const forecast = forecastOf(keyFigures);
  const paceHint = { blocks: pace.blocks, seconds: formatSeconds(pace.seconds), target: whole(targetSeconds), low: whole(pace.low), high: whole(pace.high) };
  const checkHint = { low: whole(pace.low), high: whole(pace.high), forecast: pace.seconds === null
    ? `The next check is after #${check.at}.`
    : `At ${formatSeconds(pace.seconds)} per block the check after #${check.at} ${forecast === 'stays' ? `keeps difficulty ${difficulty}` : `${forecast === 'up' ? 'raises' : 'lowers'} it to ${check.next}`}.` };
  const rewardHint = { every: halvingInterval, at: halving.at, reward: formatReward(halving.reward) };
  const parts = [
    <span key="pace" className="kf-pace" {...term('chain.block-time', paceHint)}><PaceMeter figures={keyFigures} />{paceText(keyFigures, short)}</span>,
    <span key="check" {...term('chain.check', checkHint)}>{checkText(keyFigures, short)}</span>,
    <span key="reward" {...term('chain.reward', rewardHint)}>{rewardText(keyFigures, short)}</span>
  ];
  return (
    <span className={`kf ${className}`.trim()} aria-label={label}>
      {parts.flatMap((part, i) => (i === 0 ? [part] : [<span key={`s${i}`} className="kf-sep" aria-hidden="true">·</span>, part]))}
    </span>
  );
}

/* ---------- what changed: one calm note per rule change, until dismissed ---------- */

export function ChainEventNotes({ notes = [], onDismiss }) {
  if (!notes.length) return null;
  return (
    <div className="kf-notes">
      {notes.map(note => (
        <div key={note.key} className={`kf-note is-${note.kind}${note.motion ? ' is-live' : ''}`} role="status">
          <span className="kf-note-icon" aria-hidden="true">
            {note.kind === 'halving' ? <span className="kf-coin"><i /><i /></span> : <span className="kf-arrow">{note.icon}</span>}
            <span className="kf-sparks">{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</span>
          </span>
          <span className="kf-note-body">
            {note.change?.kind === 'difficulty' && <span className="kf-zero-change" aria-hidden="true">
              <span>{'0'.repeat(Math.min(note.change.from, note.change.to))}</span>
              <b className={note.kind === 'down' ? 'is-removed' : ''}>0</b>
            </span>}
            <b>{note.title}</b>{note.lead}
            <span className="kf-note-text">{note.text}</span>
          </span>
          {onDismiss && <button type="button" className="kf-note-ok" onClick={() => onDismiss(note.key)}>Got it</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------- sticky bar: the key figures stay in view while the page scrolls ---------- */

// A slim bar at the top of the main column, shown once the chain's own key figures
// have scrolled out of view. `sentinel` marks the top of the chain.
export function KeyFigureBar({ keyFigures, height }) {
  const sentinel = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    }, { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div ref={sentinel} className="kf-sentinel" aria-hidden="true" />
      <div className="kf-bar-anchor">
        <div className={`kf-bar${shown ? ' is-shown' : ''}`} aria-hidden={!shown} inert={!shown || undefined}>
          <span className="kf-bar-title">Chain <b>#{height}</b></span>
          <KeyFigures keyFigures={keyFigures} className="kf-bar-figs" label="Key figures, kept in view" />
          <KeyFigures keyFigures={keyFigures} className="kf-bar-figs is-short" short label="Key figures, kept in view" />
        </div>
      </div>
    </>
  );
}
