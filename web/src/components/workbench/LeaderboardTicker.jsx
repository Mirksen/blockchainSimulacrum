import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLeaderboard } from '../../lib/poolApi';
import './LeaderboardTicker.css';

// Slim band under the top bar that runs the pool leaderboard from right to left
// (web/DESIGN.md, "Existing features in the workbench"). It pauses on hover and
// focus, is static under prefers-reduced-motion and renders nothing while the
// leaderboard server is unavailable or the board is empty. The only component of
// the shell that fetches: on mount and every `refreshMs`.
export const TICKER_REFRESH_MS = 60_000;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback) {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED_MOTION) : null;
  query?.addEventListener?.('change', callback);
  return () => query?.removeEventListener?.('change', callback);
}
const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_MOTION).matches);

const formatNumber = value => Number(value).toLocaleString('en-US');
const isRow = row => row !== null && typeof row === 'object' && typeof row.name === 'string' && row.name !== '';

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

function Rows({ rows, hidden }) {
  return (
    <span className="leaderboard-ticker-list" aria-hidden={hidden || undefined}>
      {rows.map((row, index) => (
        <span className="leaderboard-ticker-row" key={`${row.name}-${index}`}>
          <span className="leaderboard-ticker-rank">#{Number.isSafeInteger(row.rank) ? row.rank : index + 1}</span>
          <span className="leaderboard-ticker-name">{row.name}</span>
          <span className="leaderboard-ticker-points">{formatNumber(row.points ?? 0)} pts</span>
          <ShortHash hash={row.bestHash} />
        </span>
      ))}
    </span>
  );
}

export function LeaderboardTicker({ onOpenPool, refreshMs = TICKER_REFRESH_MS }) {
  const [rows, setRows] = useState(null);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotion, () => false);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const load = async () => {
      try {
        const answer = await getLeaderboard({ signal: controller.signal });
        if (alive) setRows(Array.isArray(answer) ? answer.filter(isRow) : null);
      } catch {
        // Unavailable or cancelled: disappear quietly until the next refresh succeeds.
        if (alive) setRows(null);
      }
    };
    void load();
    const timer = setInterval(load, refreshMs);
    return () => { alive = false; controller.abort(); clearInterval(timer); };
  }, [refreshMs]);

  if (!rows || rows.length === 0) return null;

  const leader = rows[0];
  const label = `Pool leaderboard, ${rows.length} ${rows.length === 1 ? 'miner' : 'miners'}, `
    + `leader ${leader.name} with ${formatNumber(leader.points ?? 0)} points. Open the Mining pool`;
  const duration = `${Math.max(24, rows.length * 6)}s`;
  const classes = ['leaderboard-ticker', paused && 'is-paused', reduced && 'is-static'].filter(Boolean).join(' ');

  return (
    <div className={classes} data-testid="leaderboard-ticker">
      <button type="button" className="leaderboard-ticker-button" aria-label={label} onClick={() => onOpenPool?.()}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        <span className="leaderboard-ticker-title">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 10.5V6.5M6 10.5V2.5M10 10.5V4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span className="leaderboard-ticker-title-text">Pool leaderboard</span>
        </span>
        <span className="leaderboard-ticker-viewport">
          <span className="leaderboard-ticker-track" style={{ '--leaderboard-ticker-duration': duration }}>
            <Rows rows={rows} />
            {!reduced && <Rows rows={rows} hidden />}
          </span>
        </span>
        <span className="leaderboard-ticker-open">
          Open pool
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
    </div>
  );
}
