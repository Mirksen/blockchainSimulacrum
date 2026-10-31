import { CoachMark } from './CoachMark';
import { usePeakHold } from '../../hooks/usePeakHold';
import { MIN_DIFFICULTY, MAX_DIFFICULTY } from '../../lib/difficulty';
import './cardKit.css';
import './NextBlockCard.css';
import { issueText } from './blockView';

// Next block card (web/DESIGN.md, "Card grid" and "Interaction patterns").
// One filled primary per mode:
//   fresh   "Start demo"            idle   "Mining"
//   mining  "Pause" (replaces Play; repeat stays beside it)
//   repair  "Re-mine block #K"      paused "Mining" (a new search)
//
// miners:    [{ name, hashrate?, color? }]  (color: any CSS color, defaults to var(--<name>))
// race:      { perMiner: { [name]: { nonce, hash, zeros, iterations } }, attempts, elapsedMs, targetSeconds, winner }
// lastRound: { index, winner, nonce, attempts, elapsedMs, difficulty?, perMiner: { [name]: { nonce, zeros } } }
// repair:    { next, order, undoOnly?, stuck?, reason? }  order = the re-mine path in order, `next` the block to re-mine now
//            (with undoOnly the edited block; `stuck` and `reason` name the block and the rule re-mining cannot fix);
//            blocks before `next` in `order` count as done

const KNOWN_COLORS = ['lars', 'minas', 'alice', 'bob', 'chris'];

function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const fixed = value.toFixed(8).replace(/0+$/, '');
  const [whole, fraction = ''] = fixed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
const count = value => Number(value ?? 0).toLocaleString('en-US');
const seconds = ms => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s`;
const minerColor = miner => miner.color
  ?? (KNOWN_COLORS.includes(String(miner.name).toLowerCase()) ? `var(--${String(miner.name).toLowerCase()})` : 'var(--text-3)');

const BoltIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5L3 9h4.5l-1 5.5L13 7H8.5z" fill="currentColor" /></svg>
);
const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="3" y="2.5" width="2" height="7" rx=".6" fill="currentColor" /><rect x="7" y="2.5" width="2" height="7" rx=".6" fill="currentColor" /></svg>
);
const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l8 5-8 5z" fill="currentColor" /></svg>
);
const RepeatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6V5a2 2 0 0 1 2-2h8m-2-2 2 2-2 2M13 10v1a2 2 0 0 1-2 2H3m2 2-2-2 2-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const UndoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6h6a3.5 3.5 0 0 1 0 7H6M4 6l3-3M4 6l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const MinusIcon = () => <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.5" /></svg>;
const PlusIcon = () => <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5h7M5 1.5v7" stroke="currentColor" strokeWidth="1.5" /></svg>;
const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Avatar({ miner }) {
  return <span className="card-kit-av" style={{ '--av-color': minerColor(miner) }} aria-hidden="true">{String(miner.name).charAt(0).toUpperCase()}</span>;
}

function Track({ zeros, difficulty, label }) {
  const reached = Math.max(0, Math.min(zeros ?? 0, difficulty));
  const pct = difficulty > 0 ? (reached / difficulty) * 100 : 0;
  const ticks = Array.from({ length: Math.max(0, difficulty - 1) }, (_, i) => ((i + 1) / difficulty) * 100);
  return (
    <div className="next-block-track" role="img" aria-label={label}>
      <span className="next-block-track-rail" />
      <span className="next-block-track-fill" style={{ width: `${pct}%` }} />
      {ticks.map(left => <span key={left} className="next-block-track-cp" style={{ left: `${left}%` }} />)}
      <span className="next-block-track-cp is-goal" style={{ left: 'calc(100% - 1px)' }} />
      <span className="next-block-track-runner" style={{ left: `clamp(6px, ${pct}%, calc(100% - 6px))` }} />
    </div>
  );
}

// Current hash with its first `difficulty` characters checked against the target.
function CheckedHash({ hash, difficulty }) {
  if (!hash) return <span className="next-block-hx card-kit-t3">no hash yet</span>;
  const head = hash.slice(0, difficulty).split('');
  const hits = head.filter(c => c === '0').length;
  const label = `Current hash ${hash.slice(0, 8)}…, ${head.map(c => (c === '0' ? `${c} meets the target` : `${c} does not`)).join(', ')}`;
  return (
    <span className="next-block-hx" aria-label={label} data-hits={hits}>
      {head.map((c, i) => <span key={i} className={`next-block-hx-c${c === '0' ? ' is-hit' : ''}`}>{c}</span>)}
      <span className="next-block-hx-rest">{hash.slice(difficulty, difficulty + 6)}…</span>
    </span>
  );
}

function zeroStatus(zeros, difficulty, isWinner) {
  const z = Math.max(0, Math.min(zeros ?? 0, difficulty));
  if (isWinner || z >= difficulty) return { cls: 'is-ok', text: `${z}/${difficulty} zeros`, dot: true };
  if (z > 0) return { cls: 'is-pending', text: `${z}/${difficulty} · close`, dot: true };
  return { cls: 'is-none', text: `${z}/${difficulty} zeros`, dot: false };
}

export function NextBlockCard({
  mode = 'idle', index, txCount = 0, reward, difficulty = 2, onDifficulty, autoMine = false, onAutoMine,
  onStartDemo, onMine, onPause, onRemine, repair = null, miners = [], race = null, lastRound = null,
  backedMiner = null, onBack, coach = null
}) {
  const isMining = mode === 'mining';
  const isRepair = mode === 'repair';
  const isFresh = mode === 'fresh';
  const isPaused = mode === 'paused';
  const settingsLocked = isMining || isRepair;
  const target = '0'.repeat(difficulty);

  const meta = isFresh ? '· Genesis only'
    : `· ${txCount} tx${isMining ? '' : ' waiting'}${reward != null ? ` · reward ${formatAmount(reward)}` : ''}`;
  let headStatus = null;
  if (isMining) headStatus = <span className="card-kit-pill is-live"><i aria-hidden="true" />Mining block #{index}…</span>;
  if (isPaused) headStatus = <span className="card-kit-pill is-none"><PauseIcon />Paused</span>;
  const headAside = isRepair
    ? <span className="next-block-paused" role="status"><PauseIcon />Paused while the chain is invalid</span>
    : <span className="card-kit-aside">{index > 0 ? `builds on #${index - 1}` : ''}</span>;

  const repeatToggle = (
    <button type="button" className="next-block-repeat" aria-label="Auto-mine" aria-pressed={autoMine}
      title={autoMine ? 'Turn off repeat; let the current block finish' : 'Automatically mine one block after another. Use Auto-transact to fill sample transfers.'}
      disabled={isRepair} onClick={() => onAutoMine?.(!autoMine)}>
      <RepeatIcon /><span>Auto-mine</span>
    </button>
  );
  const stepper = (
    <CoachMark target="workbench.difficulty" coach={coach} className="next-block-coach-inline">
      <span className={`next-block-stepper${settingsLocked ? ' is-locked' : ''}`}
        title={isMining ? 'Locked while a block is being mined' : isRepair ? 'Repair the chain first' : undefined}>
        Difficulty
        <span className="next-block-stepper-box">
          <button type="button" aria-label="Lower difficulty" disabled={settingsLocked || difficulty <= MIN_DIFFICULTY}
            onClick={() => onDifficulty?.(difficulty - 1)}><MinusIcon /></button>
          <output aria-label="Difficulty">{difficulty}</output>
          <button type="button" aria-label="Raise difficulty" disabled={settingsLocked || difficulty >= MAX_DIFFICULTY}
            onClick={() => onDifficulty?.(difficulty + 1)}><PlusIcon /></button>
        </span>
      </span>
    </CoachMark>
  );

  const running = isMining || (autoMine && !isRepair);
  const startsDemo = isFresh && !autoMine;
  // Keep the same button mounted so keyboard focus follows Play → Pause → Play.
  const action = (
    <CoachMark target={running || isRepair || startsDemo ? undefined : "workbench.mine"} coach={running || isRepair || startsDemo ? null : coach} className="next-block-coach-inline">
      <button type="button" className={isRepair ? 'card-kit-btn is-lg' : 'btn-primary'}
        disabled={isRepair} title={isRepair ? 'Repair the chain first' : undefined}
        aria-keyshortcuts={!running && !startsDemo && !isRepair ? 'M' : undefined}
        onClick={() => running ? onPause?.() : startsDemo ? onStartDemo?.() : onMine?.()}>
        {running ? <PauseIcon /> : <PlayIcon />}
        {running ? 'Pause' : startsDemo ? 'Start demo' : 'Mining'}
      </button>
    </CoachMark>
  );

  return (
    <section className={`next-block is-${mode}`} aria-label={`Next block ${index}${isMining ? ', being mined' : isRepair ? ', paused while the chain is invalid' : ''}`}
      aria-busy={isMining ? 'true' : undefined}>
      <div className="next-block-head">
        <h2 className="next-block-title">Next block #{index}</h2>
        <span className="next-block-meta">{meta}</span>
        {headStatus}
        {headAside}
      </div>
      <div className="next-block-actions">
        {stepper}
        <div className="next-block-action" role="group" aria-label="Mining controls">
          {action}
          {repeatToggle}
        </div>
      </div>
      {isRepair
        ? <RepairBody repair={repair} difficulty={difficulty} target={target} onRemine={onRemine} coach={coach} />
        : isMining
          ? <LiveRace miners={miners} race={race} index={index} difficulty={difficulty} target={target} backedMiner={backedMiner} coach={coach} />
          : <LastRound miners={miners} lastRound={lastRound} race={isPaused ? race : null} difficulty={difficulty}
            backedMiner={backedMiner} onBack={onBack} coach={coach} isFresh={isFresh} />}
    </section>
  );
}

function LastRound({ miners, lastRound, race, difficulty, backedMiner, onBack, coach, isFresh }) {
  const d = lastRound?.difficulty ?? difficulty;
  const total = miners.reduce((sum, m) => sum + (Number(m.hashrate) || 0), 0);
  const coached = coach?.target === 'workbench.back-miner';
  let summary;
  if (race) {
    summary = <>Paused after <b>{count(race.attempts)}</b> attempts · <b>{seconds(race.elapsedMs)}</b>. Mining again starts a new search.</>;
  } else if (lastRound) {
    summary = <>Last round #{lastRound.index}: <span className="next-block-winner" style={{ color: minerColor(miners.find(m => m.name === lastRound.winner) ?? { name: lastRound.winner }) }}>{lastRound.winner}</span> won at nonce <b>{count(lastRound.nonce)}</b> · <b>{count(lastRound.attempts)}</b> tries · <b>{seconds(lastRound.elapsedMs)}</b></>;
  } else {
    summary = isFresh
      ? <>Start demo mines block #1, shares its reward with the other wallets, then mines #2.</>
      : <>No round yet. Mine a block to watch the miners race.</>;
  }
  return (
    <div className="next-block-body" data-round="last">
      <div className="next-block-summary">{summary}</div>
      <CoachMark target="workbench.back-miner" coach={coach} className="next-block-coach-block">
        <div className="next-block-lanes">
          {miners.map(miner => {
            const result = race?.perMiner?.[miner.name] ?? lastRound?.perMiner?.[miner.name] ?? null;
            const isWinner = !race && lastRound?.winner === miner.name;
            const backed = backedMiner === miner.name;
            const zeros = result ? Math.min(result.zeros ?? 0, d) : 0;
            return (
              <div key={miner.name} className={`next-block-lane${isWinner ? ' is-winner' : ''}${backed ? ' is-backed' : ''}`}
                style={{ '--miner-color': minerColor(miner) }} data-miner={miner.name}>
                <div className="next-block-who"><Avatar miner={miner} /><span className="next-block-nm"><b>{miner.name}</b>
                  <small>{result ? <>nonce {count(result.nonce)} · {isWinner ? <em className="is-win">{zeros}/{d} zeros</em> : `${zeros}/${d} zeros`}</> : 'no round yet'}
                    {backed && <> · <em className="is-backed">backed</em></>}</small></span></div>
                <Track zeros={zeros} difficulty={d}
                  label={result ? `${miner.name} reached ${zeros} of ${d} leading zeros` : `${miner.name} has not raced yet`} />
                <div className="next-block-lane-end">
                  <button type="button" className={`card-kit-btn is-sm${backed ? ' is-pressed' : coached ? '' : ' is-ghost'}`}
                    aria-pressed={backed ? 'true' : 'false'} onClick={() => onBack?.(backed ? null : miner.name)}>
                    {backed && <CheckIcon />}Back {miner.name}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </CoachMark>
      <div className="next-block-foot">
        {total > 0 && (
          <span>Odds per block: {miners.map((m, i) => (
            <span key={m.name}>{i > 0 && ' · '}<b>{m.name} {((Number(m.hashrate) || 0) / total * 100).toFixed(1)} %</b></span>
          ))}</span>
        )}
      </div>
    </div>
  );
}

function LiveMinerLane({ miner, p, difficulty, isWinner, backed }) {
  const zeros = Math.min(p?.zeros ?? 0, difficulty);
  const peak = usePeakHold(Math.min(p?.peakZeros ?? zeros, difficulty), p?.iterations ?? -1);
  const st = zeroStatus(zeros, difficulty, isWinner);
  return (
    <div className={`next-block-lane is-live${isWinner ? ' is-winner' : ''}${backed ? ' is-backed' : ''}`}
      style={{ '--miner-color': minerColor(miner) }} data-miner={miner.name}>
      <div className="next-block-who"><Avatar miner={miner} /><span className="next-block-nm"><b>{miner.name}</b>
        <small>nonce {p ? count(p.nonce) : '–'}{backed && <> · <em className="is-backed">backed</em></>}</small></span></div>
      <div className="next-block-live" title="Recent peak: holds the highest leading-zero count for one second, then settles to the highest newer result.">
        <CheckedHash hash={p?.hash} difficulty={difficulty} />
        <Track zeros={peak} difficulty={difficulty} label={`${miner.name} recent peak ${peak} of ${difficulty} leading zeros`} />
      </div>
      <div className="next-block-lane-end"><span className={`card-kit-pill ${st.cls}`}>{st.dot && <i aria-hidden="true" />}{st.text}</span></div>
    </div>
  );
}

function LiveRace({ miners, race, index, difficulty, target, backedMiner, coach }) {
  const targetSeconds = race?.targetSeconds;
  const elapsed = race?.elapsedMs ?? 0;
  const timePct = targetSeconds ? Math.min(100, (elapsed / 1000 / targetSeconds) * 100) : 0;
  return (
    <div className="next-block-body" data-round="live">
      <div className="next-block-summary">Live round #{index}: the first hash that starts with <span className="next-block-tgt">{target}</span> wins · every try is a new nonce</div>
      {/* While a race runs, the "watch the race" step points at the lanes, not at the disabled button. */}
      <CoachMark target="workbench.mine" coach={coach} className="next-block-coach-block">
      <CoachMark target="workbench.back-miner" coach={coach} className="next-block-coach-block">
        <div className="next-block-lanes">
          {miners.map(miner => <LiveMinerLane key={miner.name} miner={miner} p={race?.perMiner?.[miner.name]}
            difficulty={difficulty} isWinner={race?.winner === miner.name} backed={backedMiner === miner.name} />)}
        </div>
      </CoachMark>
      </CoachMark>
      <div className="next-block-foot">
        <span><b>{count(race?.attempts)}</b> attempts · <b>{seconds(elapsed)}</b>{targetSeconds ? <> of the {targetSeconds} s target</> : null}</span>
        {targetSeconds ? <span className="next-block-timebar" role="img" aria-label={`${(elapsed / 1000).toFixed(1)} of ${targetSeconds} seconds`}><i style={{ width: `${timePct}%` }} /></span> : null}
      </div>
    </div>
  );
}

function RepairBody({ repair, difficulty, target, onRemine, coach }) {
  const order = repair?.order ?? [];
  const next = repair?.next ?? order[0];
  const done = Math.max(0, order.indexOf(next));
  const rest = order.slice(done + 1);
  const then = rest.length ? ` Then ${rest.map(i => `#${i}`).join(', then ')}.` : '';
  return (
    <div className="next-block-body" data-round="repair">
      <div className="next-block-repair-head"><span><b>Repair first</b> · {repair?.undoOnly ? 'undo the edit' : 're-mine in order'}</span>
        {order.length > 0 && (
          <span className="next-block-order" aria-label={`Re-mine order, ${done} of ${order.length} done`}>
            {order.map((blockIndex, i) => (
              <span key={blockIndex} className="next-block-order-item">
                {i > 0 && <span className="next-block-order-ar" aria-hidden="true">→</span>}
                <span className={`next-block-ob${blockIndex === next ? ' is-next' : ''}${i < done ? ' is-done' : ''}`}>
                  <i>{i < done ? <CheckIcon /> : i + 1}</i>#{blockIndex}
                </span>
              </span>
            ))}
            <span className="card-kit-t3">{done} of {order.length}</span>
          </span>
        )}
      </div>
      {repair?.undoOnly
        // A broken transaction rule survives every re-mine; only undoing the edit repairs it.
        ? <div className="next-block-repair-row">
          <button type="button" className="btn-primary" onClick={() => repair.onUndo?.(next)}><UndoIcon />Undo edit in block #{next}</button>
          <small>{issueText(repair.reason ?? 'signature', repair.stuck ?? next)} Re-mining changes no transaction, so it cannot fix this.</small>
        </div>
        : <CoachMark target="workbench.remine" coach={coach} className="next-block-coach-block">
          <div className="next-block-repair-row">
            <button type="button" className="btn-primary" aria-keyshortcuts="M" onClick={() => onRemine?.(next)}><BoltIcon />Re-mine block #{next}</button>
            <small>Finds a new nonce so #{next} starts with {target} again.{then}</small>
          </div>
        </CoachMark>}
      <div className="next-block-foot">
        <span>Each re-mine is a full race at difficulty {difficulty}.</span>
      </div>
    </div>
  );
}
