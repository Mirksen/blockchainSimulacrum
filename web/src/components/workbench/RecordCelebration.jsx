import { useEffect, useRef } from 'react';
import { recordCopy } from '../../lib/records';
import './RecordCelebration.css';

// A short celebration when an accepted block sets a record (web/DESIGN.md, "Record
// celebration"): a card drops in at the top with a burst of confetti, says what was
// reached and offers the leaderboard. It does not block the page, closes by itself after
// `durationMs`, on Escape or with ×, and holds while pointer or focus rest on it. Under
// prefers-reduced-motion the card simply fades in, without confetti.
export const CELEBRATION_MS = 6000;
const PIECES = 40;
const COLORS = ['var(--coach)', 'var(--green)', 'var(--amber)', 'var(--hal)', 'var(--dorian)', 'var(--laszlo)'];

// Fixed spread so a render is deterministic: angle, distance, delay and color per piece.
const confetti = Array.from({ length: PIECES }, (_, i) => {
  const angle = -170 + (160 * i) / (PIECES - 1) + ((i * 37) % 11) - 5;
  const distance = 100 + ((i * 53) % 110);
  return {
    x: Math.round(Math.cos((angle * Math.PI) / 180) * distance),
    y: Math.round(Math.sin((angle * Math.PI) / 180) * distance),
    fall: 70 + ((i * 29) % 60),
    spin: ((i % 2 ? 1 : -1) * (240 + ((i * 41) % 300))),
    delay: (i % 5) * 40,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0
  };
});

function TrophyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" fill="currentColor" />
      <path d="M7 6H4.5v1A3.5 3.5 0 0 0 8 10.5M17 6h2.5v1A3.5 3.5 0 0 1 16 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 13v4M8.5 20h7M9.5 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RecordCelebration({ record, name, onClose, onOpenLeaderboard, durationMs = CELEBRATION_MS }) {
  const held = useRef({ pointer: false, focus: false });
  const timer = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!record) return undefined;
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (!held.current.pointer && !held.current.focus) closeRef.current?.(); else arm(); }, durationMs);
    };
    arm();
    const onKey = event => { if (event.key === 'Escape') closeRef.current?.(); };
    globalThis.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer.current); globalThis.removeEventListener('keydown', onKey); };
  }, [record, durationMs]);

  if (!record) return null;
  const copy = recordCopy(record);
  return (
    <div className="record-celebration" data-kind={record.kind}>
      <div className="record-celebration-card" role="status" aria-live="polite"
        onPointerEnter={() => { held.current.pointer = true; }} onPointerLeave={() => { held.current.pointer = false; }}
        onFocus={() => { held.current.focus = true; }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) held.current.focus = false; }}>
        <span className="record-celebration-burst" aria-hidden="true">
          {confetti.map((piece, i) => (
            <i key={i} className={piece.round ? 'is-round' : undefined} style={{
              '--x': `${piece.x}px`, '--y': `${piece.y}px`, '--fall': `${piece.fall}px`, '--spin': `${piece.spin}deg`,
              '--delay': `${piece.delay}ms`, '--color': piece.color
            }} />
          ))}
        </span>
        <span className="record-celebration-badge" aria-hidden="true">
          {record.kind === 'zeros' ? <b>{record.zeros}</b> : record.kind === 'entered' ? <TrophyIcon /> : <b>#{record.rank}</b>}
        </span>
        <span className="record-celebration-body">
          <strong className="record-celebration-title">{copy.title}</strong>
          <span className="record-celebration-text">{copy.text}</span>
          {name && <span className="record-celebration-name">{name}</span>}
        </span>
        <span className="record-celebration-actions">
          <button type="button" className="record-celebration-open" onClick={() => { onOpenLeaderboard?.(); onClose?.(); }}>Leaderboard</button>
          <button type="button" className="record-celebration-close" aria-label="Close" onClick={() => onClose?.()}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </span>
      </div>
    </div>
  );
}
