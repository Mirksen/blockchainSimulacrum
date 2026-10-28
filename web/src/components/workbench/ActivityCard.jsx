import './cardKit.css';
import './ActivityCard.css';

// Activity card (web/DESIGN.md, "Card grid": only on tall screens; prototype round-6
// base.html). Recent confirmed transactions on the left, block times on the right.
// confirmed:  [{ blockIndex, label, amount }]  newest first; label like "Coinbase → Lars",
//             amount a number or a ready string ("0.60 each")
// blockTimes: [{ index, seconds }]             newest first
// targetSeconds: the target block time

function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const fixed = value.toFixed(8).replace(/0+$/, '');
  const [whole, fraction = ''] = fixed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
const secondsText = value => `${Number(value).toFixed(1)} s`;

export function ActivityCard({ confirmed = [], blockTimes = [], targetSeconds = 10 }) {
  const times = blockTimes.filter(t => Number.isFinite(Number(t.seconds)));
  const average = times.length ? times.reduce((sum, t) => sum + Number(t.seconds), 0) / times.length : null;
  const scale = Math.max(targetSeconds || 0, ...times.map(t => Number(t.seconds)), 0.1);
  const pct = value => `${Math.min(100, (value / scale) * 100)}%`;
  const blocks = new Set(confirmed.map(c => c.blockIndex));
  return (
    <section className="card-kit activity-card" aria-label="Activity">
      <div className="activity-card-cols">
        <div className="activity-card-col">
          <div className="card-kit-head">
            <h2 className="card-kit-title">Activity</h2>
            <span className="card-kit-t3 activity-card-sub">recent confirmed transactions</span>
            <span className="card-kit-aside">{blocks.size ? `last ${blocks.size} ${blocks.size === 1 ? 'block' : 'blocks'}` : ''}</span>
          </div>
          <ul className="activity-card-list" aria-label="Recent confirmed transactions">
            {confirmed.length === 0 && <li className="card-kit-empty">No confirmed transactions yet.<small>Mine a block to confirm what waits in the mempool.</small></li>}
            {confirmed.map((item, i) => (
              <li key={`${item.blockIndex}-${i}`} className="activity-card-row">
                <span className="activity-card-blk">#{item.blockIndex}</span>
                <span className="activity-card-what">{item.label}</span>
                <span className="activity-card-amt">{formatAmount(item.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="activity-card-col is-times">
          <div className="card-kit-head">
            <h2 className="card-kit-title">Block times</h2>
            <span className="card-kit-aside">
              {average != null ? <>avg <b>{secondsText(average)}</b> · </> : null}target <b>{targetSeconds} s</b>
            </span>
          </div>
          <ul className="activity-card-list"
            aria-label={`Block times, scale 0 to ${secondsText(scale)}, target ${targetSeconds} s${average != null ? `, average ${secondsText(average)}` : ''}`}>
            {times.length === 0 && <li className="card-kit-empty">No blocks mined yet.<small>Each mined block adds its time here.</small></li>}
            {times.map(t => {
              const value = Number(t.seconds);
              const over = targetSeconds && value > targetSeconds;
              return (
                <li key={t.index} className={`activity-card-row${over ? ' is-over' : ''}`}>
                  <span className="activity-card-blk">#{t.index}</span>
                  <span className="activity-card-bar" aria-hidden="true">
                    <span className="activity-card-bar-rail" />
                    <span className="activity-card-bar-fill" style={{ width: pct(value) }} />
                    {average != null && <span className="activity-card-bar-cp" style={{ left: pct(average) }} />}
                    {targetSeconds ? <span className="activity-card-bar-cp is-goal" style={{ left: `calc(${pct(targetSeconds)} - 1px)` }} /> : null}
                  </span>
                  <span className="activity-card-sec">{secondsText(value)}{over ? <span className="card-kit-sr"> (over the target)</span> : null}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
