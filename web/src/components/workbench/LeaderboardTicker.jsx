import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLeaderboard } from '../../lib/poolApi';
import { findsOf, formatDifficulty } from '../../lib/poolProof';
import './LeaderboardTicker.css';

// Slim band under the top bar that runs the all-time pool leaderboard from right to left
// (web/DESIGN.md, "Existing features in the workbench"). It pauses on hover and
// focus and is static under prefers-reduced-motion. An empty board still shows, as an
// invitation, so the leaderboard can be found before its first block; only an unavailable
// server hides the band. The only component of the shell that fetches: on mount, every
// `refreshMs` and when `refreshKey` changes (a block was accepted); `onBoard` hands the rows up.
export const TICKER_REFRESH_MS = 60_000;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback) {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED_MOTION) : null;
  query?.addEventListener?.('change', callback);
  return () => query?.removeEventListener?.('change', callback);
}
const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_MOTION).matches);


// Short hash: first 6 + last 2 characters, leading zeros highlighted (web/DESIGN.md).
function ShortHash({ hash }) {
  const text = typeof hash === 'string' ? hash : '';
  if (text.length < 9) return <span className="leaderboard-ticker-hash">{text || '–'}</span>;
  const head = text.slice(0, 6);
  const zeros = head.length - head.replace(/^0+/, '').length;
  return (
    <span className="leaderboard-ticker-hash" title={text}>
      {zeros > 0 && <b className="leaderboard-ticker-zero">{head.slice(0, zeros)}</b>}
      {head.slice(zeros)}…{text.slice(-2)}
    </span>
  );
}

function Rows({ rows, finds, hidden }) {
  return (
    <span className="leaderboard-ticker-list" aria-hidden={hidden || undefined}>
      {rows.map((row, index) => (
        <span className="leaderboard-ticker-row" key={`${row.name}-${index}`}>
          <span className="leaderboard-ticker-rank">#{Number.isSafeInteger(row.rank) ? row.rank : index + 1}</span>
          <span className="leaderboard-ticker-name">{row.name}</span>
          <span className="leaderboard-ticker-points">{row.bestZeros} zeros · {formatDifficulty(row.difficulty)}</span>
          <ShortHash hash={row.bestHash} />
        </span>
      ))}
      {finds.map(find => (
        <span className="leaderboard-ticker-row is-find" key={find.label}>
          <span className="leaderboard-ticker-find">{find.label}</span>
          <span className="leaderboard-ticker-name">{find.name}</span>
          <span className="leaderboard-ticker-points">{find.value}</span>
        </span>
      ))}
    </span>
  );
}

export function LeaderboardTicker({ onOpenPool, onBoard, refreshKey = 0, refreshMs = TICKER_REFRESH_MS }) {
  const [rows, setRows] = useState(null);
  const [finds, setFinds] = useState([]);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotion, () => false);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const load = async () => {
      try {
        const answer = await getLeaderboard({ signal: controller.signal });
        if (alive) { setRows(answer.allTime); setFinds(findsOf(answer)); onBoard?.(answer.allTime); }
      } catch {
        // Unavailable or cancelled: disappear quietly until the next refresh succeeds.
        if (alive) { setRows(null); onBoard?.(null); }
      }
    };
    void load();
    const timer = setInterval(load, refreshMs);
    return () => { alive = false; controller.abort(); clearInterval(timer); };
  }, [onBoard, refreshKey, refreshMs]);

  if (!rows) return null;

  const leader = rows[0];
  const label = leader
    ? `Leaderboard, ${rows.length} ${rows.length === 1 ? 'miner' : 'miners'}, leader ${leader.name} with ${leader.bestZeros} zeros. Open the leaderboard`
    : 'Leaderboard, no blocks yet. Open the leaderboard';
  const duration = `${Math.max(24, (rows.length + finds.length) * 6)}s`;
  const classes = ['leaderboard-ticker', paused && 'is-paused', reduced && 'is-static'].filter(Boolean).join(' ');

  return (
    <div className={classes} data-testid="leaderboard-ticker">
      <button type="button" className="leaderboard-ticker-button" aria-label={label} onClick={() => onOpenPool?.()}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        <span className="leaderboard-ticker-title">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10.5V6.5M6 10.5V2.5M10 10.5V4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span className="leaderboard-ticker-title-text">All-time best</span>
        </span>
        <span className="leaderboard-ticker-viewport">
          {leader
            ? <span className="leaderboard-ticker-track" style={{ '--leaderboard-ticker-duration': duration }}>
              <Rows rows={rows} finds={finds} />
              {!reduced && <Rows rows={rows} finds={finds} hidden />}
            </span>
            : <span className="leaderboard-ticker-empty">No blocks yet. Mine the first one.</span>}
        </span>
        <span className="leaderboard-ticker-open">
          Open
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
    </div>
  );
}
