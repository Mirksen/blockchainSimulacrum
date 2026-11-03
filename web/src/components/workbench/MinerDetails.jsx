import { useEffect, useId, useRef, useState } from 'react';
import { headerFields, le } from '../../../../shared/bitcoin-block.mjs';
import { MAX_SHARE, MIN_SHARE } from '../../lib/blockchain';
import { COUNT_ZEROS, SLOW_MS } from '../../lib/powSearch';
import { hint } from '../../lib/hints';
import { duration, expectedAttempts, minerColor, rateOf, shareOf } from './minerDetailsModel';
import './cardKit.css';
import './MinerDetails.css';

const count = value => Math.round(Number(value) || 0).toLocaleString('en-US');

// Miner details (web/DESIGN.md, "Miner details"): a miner's share of the hashpower, which
// it can change at any time, and its newest attempts as they happen. The popover under a
// race lane and the drawer beside the workbench are made of the same parts.
//
// miner:    { name, hashpower, color?, colorKey? }        miners: the enabled miners
// progress: { nonce, hash, iterations, elapsedMs, stream: [{ nonce, hash, zeros }] (oldest first),
//             best: { nonce, hash, zeros } | null, zeroCounts: [n0, n1, …], header: hex of 76 bytes }

export function MinerAvatar({ miner, size = 'md' }) {
  return <span className={`miner-av is-${size}`} style={{ '--av-color': minerColor(miner) }} aria-hidden="true">{String(miner.name).charAt(0).toUpperCase()}</span>;
}

// The share slider: `onShare(name, percent)`; the other miners give way in proportion.
export function ShareSlider({ miner, miners, onShare, compact = false, note = true }) {
  const id = useId();
  const share = shareOf(miner, miners);
  const others = miners.filter(m => m.name !== miner.name);
  const alone = others.length === 0;
  return (
    <div className={`miner-share${compact ? ' is-compact' : ''}`} style={{ '--miner-color': minerColor(miner) }}>
      <div className="miner-share-row">
        <input id={id} type="range" min={MIN_SHARE} max={MAX_SHARE} step="1" value={alone ? 100 : Math.min(MAX_SHARE, Math.max(MIN_SHARE, share))}
          disabled={alone || !onShare} aria-label={`${miner.name}'s share of the hashpower`} {...hint('next.hashpower')}
          aria-valuetext={`${share} %, ${share} % chance to find the next block`}
          onChange={event => onShare?.(miner.name, Number(event.target.value))} />
        <output htmlFor={id} className="miner-share-value">{share} %</output>
      </div>
      {!compact && (
        <div className="miner-share-bar" aria-hidden="true">
          {miners.map(m => <i key={m.name} style={{ width: `${shareOf(m, miners)}%`, background: minerColor(m), opacity: m.name === miner.name ? 1 : 0.35 }} />)}
        </div>
      )}
      {note && <p className="miner-note">{alone ? 'The only miner racing: it has all the hashpower.'
        : <>Takes from the others in proportion: {others.map(m => `${m.name} ${shareOf(m, miners)} %`).join(' · ')}</>}</p>}
    </div>
  );
}

// One hash with its first `difficulty` characters checked: zeros that meet the target
// are green, the first character that does not is red.
export function MarkedHash({ hash, difficulty }) {
  let zeros = 0;
  while (zeros < difficulty && hash[zeros] === '0') zeros++;
  return (
    <span className="miner-hash">
      <span className="miner-hash-hit">{hash.slice(0, zeros)}</span>
      {zeros < difficulty ? <><span className="miner-hash-miss">{hash[zeros]}</span>{hash.slice(zeros + 1)}</> : hash.slice(zeros)}
    </span>
  );
}

// The newest attempts, newest first.
export function AttemptStream({ miner, stream, difficulty, rows = 24, winnerNonce = null }) {
  const list = (stream ?? []).slice(-rows).reverse();
  return (
    <div className="miner-stream" role="table" aria-label={`Newest attempts of ${miner.name}`} style={{ '--rows': rows }}>
      <div role="rowgroup" className="card-kit-sr"><div role="row"><span role="columnheader">Nonce</span><span role="columnheader">Hash</span><span role="columnheader">Leading zeros</span></div></div>
      <div role="rowgroup">
        {list.length === 0 && <div role="row" className="miner-stream-row is-empty"><span role="cell">No attempts yet. Mine a block to watch {miner.name} guess.</span></div>}
        {list.map(attempt => {
          const win = attempt.zeros >= difficulty && attempt.nonce === winnerNonce;
          const cls = win ? ' is-win' : attempt.zeros >= difficulty - 1 && attempt.zeros > 0 ? ' is-close' : attempt.zeros >= 2 ? ' is-some' : '';
          return (
            <div role="row" key={attempt.nonce} className={`miner-stream-row${cls}`}>
              <span role="cell" className="miner-stream-nonce">{count(attempt.nonce)}</span>
              <span role="cell" className="miner-stream-hash"><MarkedHash hash={attempt.hash} difficulty={difficulty} /></span>
              <span role="cell" className="miner-stream-zeros">{attempt.zeros}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// How many attempts had 0, 1, 2… leading zeros, against what chance predicts: each extra zero
// is 16 times rarer. Bars on a log scale, so the rare right side stays visible.
export function ZeroHistogram({ counts = [], difficulty }) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  const last = Math.min(Math.max(difficulty, 2), COUNT_ZEROS);
  const columns = Array.from({ length: last + 1 }, (_, zeros) => {
    const n = zeros === last ? counts.slice(zeros).reduce((sum, v) => sum + v, 0) : counts[zeros] ?? 0;
    const expected = total * (zeros === last ? 16 ** -zeros : 16 ** -zeros * 15 / 16);
    return { zeros, n, expected, label: zeros === last ? `${zeros}+` : String(zeros) };
  });
  const top = Math.log10(Math.max(1, ...columns.map(c => Math.max(c.n, c.expected))) + 1);
  const height = v => (v > 0 ? Math.max(3, Math.log10(v + 1) / top * 100) : 0);
  return (
    <figure className="miner-hist">
      <div className="miner-hist-cols" role="img" aria-label={`Attempts by leading zeros: ${columns.map(c => `${c.label} zeros ${count(c.n)}, expected ${count(c.expected)}`).join('; ')}`}>
        {columns.map(c => (
          <div key={c.zeros} className={`miner-hist-col${c.zeros >= difficulty ? ' is-goal' : ''}`}>
            <span className="miner-hist-n">{count(c.n)}</span>
            <span className="miner-hist-bar" style={{ height: `${height(c.n)}%` }} />
            <span className="miner-hist-exp" style={{ bottom: `${height(c.expected)}%` }} />
            <span className="miner-hist-label">{c.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="miner-note">Leading zeros of every attempt this round; the dashed line is what chance predicts. Each extra zero is 16 times rarer.</figcaption>
    </figure>
  );
}

const FIELD_LABELS = { version: 'Version', previousHash: 'Previous hash', merkleRoot: 'Merkle root', time: 'Time', bits: 'Bits', nonce: 'Nonce' };
// The header this miner hashes. Only the nonce changes from attempt to attempt; the merkle
// root is its own, because its coinbase pays itself.
export function MinerHeader({ header, nonce, difficulty }) {
  if (!header || nonce == null) return <p className="miner-note">The header appears with the first attempt.</p>;
  const fields = headerFields(header + le(nonce, 4));
  const shown = { version: v => v, previousHash: v => `${v.slice(0, 16)}…`, merkleRoot: v => `${v.slice(0, 16)}… (its own coinbase)`,
    time: v => v, bits: v => `0x${v.toString(16).padStart(8, '0')} · ${difficulty} zeros`, nonce: v => count(v) };
  return (
    <dl className="miner-header">
      {fields.map(field => (
        <div key={field.name} className={field.name === 'nonce' ? 'is-nonce' : undefined}>
          <dt>{FIELD_LABELS[field.name]}</dt><dd>{shown[field.name](field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Luck({ luck, miner }) {
  const races = luck?.races ?? 0;
  const own = luck?.perMiner?.[miner.publicKey];
  if (races < 5 || !own) return <p className="miner-note">Luck shows after 5 races this session ({races} so far): blocks won against the share.</p>;
  const max = Math.max(own.won, own.expected, 1) * 1.25;
  return (
    <div className="miner-luck" style={{ '--miner-color': minerColor(miner) }}>
      <div className="miner-luck-bar" role="img" aria-label={`${own.won} blocks won, ${own.expected.toFixed(1)} expected`}>
        <span className="miner-luck-won" style={{ width: `${own.won / max * 100}%` }} />
        <span className="miner-luck-exp" style={{ left: `${own.expected / max * 100}%` }} />
      </div>
      <p className="miner-note"><b>{own.won}</b> won · <b>{own.expected.toFixed(1)}</b> expected from its share over {races} races this session.</p>
    </div>
  );
}

// The newest attempt in slow motion, step by step.
function SlowStep({ attempt, difficulty }) {
  if (!attempt) return null;
  return (
    <p className="miner-slow" role="status">
      Nonce <b>{count(attempt.nonce)}</b> → header → SHA-256 twice → <MarkedHash hash={attempt.hash.slice(0, 12)} difficulty={Math.min(difficulty, 12)} />…
      {' '}{attempt.zeros >= difficulty ? <b className="miner-hash-hit">{attempt.zeros} zeros: block found!</b>
        : <>{attempt.zeros} of {difficulty} zeros, too large. Next nonce.</>}
    </p>
  );
}

function statusOf({ miner, isMining, winner }) {
  if (winner === miner.name) return <span className="card-kit-pill is-ok"><i aria-hidden="true" />Found the block</span>;
  if (isMining) return <span className="card-kit-pill is-live"><i aria-hidden="true" />Hashing</span>;
  return <span className="card-kit-pill is-none">Waiting for the next race</span>;
}

// The drawer: everything about one miner, beside the race. Not modal: the race stays usable.
export function MinerDrawer({ miner, miners, progress, difficulty, isMining, winner, luck, slowMotion, onSlowMotion, onShare, onOpenForkLab, onClose }) {
  // Freeze keeps the attempts of that moment on screen while the race goes on.
  const [frozen, setFrozen] = useState(null);
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, [miner.name]);
  const share = shareOf(miner, miners);
  const racing = miners.some(m => m.name === miner.name);
  const rate = rateOf(progress);
  const stream = progress?.stream ?? [];
  const attempts = expectedAttempts(difficulty);
  const winnerNonce = winner === miner.name ? progress?.nonce : null;
  return (
    <aside className="miner-drawer" aria-labelledby="miner-drawer-title" style={{ '--miner-color': minerColor(miner) }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <div className="miner-drawer-head">
        <MinerAvatar miner={miner} size="lg" />
        <div className="miner-drawer-who">
          <h2 id="miner-drawer-title">{miner.name}</h2>
          {statusOf({ miner, isMining, winner })}
        </div>
        <button ref={closeRef} type="button" className="card-kit-btn is-sm is-ghost" aria-label="Close miner details" onClick={onClose}>Close</button>
      </div>
      <div className="miner-drawer-body">
        <section className="miner-sec" aria-labelledby="miner-sec-power">
          <div className="miner-sec-head"><h3 id="miner-sec-power">Hashpower</h3>
            {share > 50 && racing && (
              <button type="button" className="miner-majority" onClick={onOpenForkLab}>
                Majority: it could rewrite the chain. Try it in Competing branches →
              </button>
            )}
          </div>
          {racing ? <ShareSlider miner={miner} miners={miners} onShare={onShare} />
            : <p className="miner-note">{miner.name} is switched off and does not race. Switch it on in its wallet details.</p>}
          <dl className="miner-kpis">
            <div><dt>Attempts per second</dt><dd>{rate ? count(rate) : '–'}</dd></div>
            <div><dt>Chance for the next block</dt><dd>{racing ? `${share} %` : '–'}</dd></div>
            <div><dt>Alone, a block takes about</dt><dd>{rate ? duration(attempts / rate) : '–'}</dd></div>
            <div><dt>Attempts this round</dt><dd>{count(progress?.iterations)}</dd></div>
          </dl>
        </section>
        <section className="miner-sec" aria-labelledby="miner-sec-stream">
          <div className="miner-sec-head"><h3 id="miner-sec-stream">{isMining ? 'Live attempts' : 'Attempts of the last round'}</h3>
            <span className="miner-tools">
              <button type="button" className="card-kit-btn is-sm" aria-pressed={Boolean(frozen)} onClick={() => setFrozen(f => (f ? null : stream))}>{frozen ? 'Resume' : 'Freeze'}</button>
              <button type="button" className="card-kit-btn is-sm" aria-pressed={slowMotion} onClick={() => onSlowMotion?.(!slowMotion)}
                title="One attempt every quarter second for the whole race, until this view closes or the block is found">Slow motion</button>
            </span>
          </div>
          <p className="miner-note">A block needs a hash that starts with <b className="miner-hash-hit">{'0'.repeat(difficulty)}</b>. Green: zeros that meet the target; red: the first character that does not.</p>
          <AttemptStream miner={miner} stream={frozen ?? stream} difficulty={difficulty} rows={20} winnerNonce={winnerNonce} />
          <p className="miner-note">{slowMotion
            ? `Slow motion: every attempt, one at a time. At ${Math.round(1000 / SLOW_MS)} tries per second a block takes about ${duration(attempts / (1000 / SLOW_MS))}. It speeds up again when you close this view or the block is found.`
            : rate ? `About ${count(rate)} attempts per second; the list shows the newest ${stream.length} of each update.` : 'The newest attempts appear here while it mines.'}</p>
          {slowMotion && isMining && <SlowStep attempt={stream.at(-1)} difficulty={difficulty} />}
        </section>
        <section className="miner-sec" aria-labelledby="miner-sec-best">
          <div className="miner-sec-head"><h3 id="miner-sec-best">Best hash this round</h3></div>
          {progress?.best ? (
            <p className="miner-best"><MarkedHash hash={progress.best.hash} difficulty={difficulty} />
              <small>nonce {count(progress.best.nonce)} · {progress.best.zeros} zeros · the smallest of {count(progress.iterations)} attempts</small></p>
          ) : <p className="miner-note">No attempt yet.</p>}
        </section>
        <section className="miner-sec" aria-labelledby="miner-sec-hist">
          <div className="miner-sec-head"><h3 id="miner-sec-hist">How rare are zeros?</h3></div>
          <ZeroHistogram counts={progress?.zeroCounts} difficulty={difficulty} />
        </section>
        <section className="miner-sec" aria-labelledby="miner-sec-luck">
          <div className="miner-sec-head"><h3 id="miner-sec-luck">Luck</h3></div>
          <Luck luck={luck} miner={miner} />
        </section>
        <section className="miner-sec" aria-labelledby="miner-sec-header">
          <div className="miner-sec-head"><h3 id="miner-sec-header">What it hashes</h3><span className="miner-note">only the nonce changes</span></div>
          <MinerHeader header={progress?.header} nonce={progress?.nonce} difficulty={difficulty} />
        </section>
      </div>
    </aside>
  );
}

// The popover under a race lane: share, a few attempts, the way to the drawer. `children`
// carries what only the card knows (the name field between races).
export function MinerPopover({ miner, miners, progress, difficulty, onShare, onOpenDetails, onClose, children }) {
  const rate = rateOf(progress);
  const racing = miners.some(m => m.name === miner.name);
  return (
    <div className="miner-pop" role="group" aria-label={`Miner ${miner.name}`} style={{ '--miner-color': minerColor(miner) }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      {children}
      {racing && <ShareSlider miner={miner} miners={miners} onShare={onShare} compact />}
      <p className="miner-note">{rate ? `${count(rate)} attempts/s · ` : ''}chance {shareOf(miner, miners)} %{rate ? ` · alone about ${duration(expectedAttempts(difficulty) / rate)} per block` : ''}</p>
      {progress?.stream?.length > 0 && <AttemptStream miner={miner} stream={progress.stream} difficulty={difficulty} rows={5} />}
      <div className="miner-pop-foot">
        {onOpenDetails && <button type="button" className="card-kit-btn is-sm" onClick={() => onOpenDetails(miner.name)}>All details →</button>}
        <button type="button" className="card-kit-btn is-sm is-ghost" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// All miners' attempts side by side: more hashpower, a faster stream.
export function StreamWall({ miners, perMiner = {}, difficulty, onShare, onOpenDetails }) {
  return (
    <div className="miner-wall" aria-label="Attempts of every miner">
      {miners.map(miner => {
        const progress = perMiner[miner.name];
        const rate = rateOf(progress);
        return (
          <div key={miner.name} className="miner-wall-col" style={{ '--miner-color': minerColor(miner) }}>
            <div className="miner-wall-head">
              <MinerAvatar miner={miner} size="sm" />
              <button type="button" className="miner-wall-name" onClick={() => onOpenDetails?.(miner.name)} title={`All details of ${miner.name}`}>{miner.name}</button>
              <span className="miner-note">{shareOf(miner, miners)} %{rate ? ` · ${count(rate)}/s` : ''}</span>
            </div>
            <ShareSlider miner={miner} miners={miners} onShare={onShare} compact note={false} />
            <AttemptStream miner={miner} stream={progress?.stream} difficulty={difficulty} rows={12} />
          </div>
        );
      })}
    </div>
  );
}
