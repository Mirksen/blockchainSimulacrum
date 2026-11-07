import { useEffect, useId, useRef, useState } from 'react';
import { CoachMark } from './CoachMark';
import { CreateNameForm } from './CreateNameForm';
import { RepeatToggle } from './RepeatToggle';
import { usePeakHold } from '../../hooks/usePeakHold';
import { MIN_DIFFICULTY, MAX_DIFFICULTY } from '../../lib/difficulty';
import './cardKit.css';
import './NextBlockCard.css';
import { issueText } from './blockView';
import { colorOf } from './minerColors';
import { MinerPopover, StreamWall } from './MinerDetails';
import { SLOW_MS } from '../../lib/powSearch';
import { hint, term } from '../../lib/hints';

// Next block card (web/DESIGN.md, "Card grid" and "Interaction patterns").
// One filled primary per mode:
//   fresh   "Start demo"            idle   "Mining"
//   mining  "Pause" (replaces Play, also between the blocks of a repeating run; repeat stays beside it)
// Auto-mine is a setting: it never starts or stops a search. `repeating` says that a run
// started with Play continues with the next block.
//   repair  "Re-mine block #K"      paused "Mining" (a new search)
//
// miners:    [{ name, hashpower?, hashrate?, color? }]  (color: any CSS color, defaults to var(--<name>));
//            the odds follow hashpower, the nonces a miner tries per turn, else the measured hashrate
// race:      { perMiner: { [name]: { nonce, hash, zeros, iterations } }, attempts, elapsedMs, targetSeconds, winner }
// lastRound: { index, winner, nonce, attempts, elapsedMs, difficulty?, perMiner: { [name]: { nonce, zeros } } }
// repair:    { next, order, undoOnly?, stuck?, reason? }  order = the re-mine path in order, `next` the block to re-mine now
//            (with undoOnly the edited block; `stuck` and `reason` name the block and the rule re-mining cannot fix);
//            blocks before `next` in `order` count as done
// onCreateMiner(name) returns { success, error }; "Create miner" sits under the lanes between
// races (a miner joins from the next block) and is disabled with `minersFull`.
// A click on a miner opens its popover (MinerDetails.jsx), between races and during one:
// onShare(name, percent) sets its share of the hashpower, which is its chance to find the next
// block; onOpenMiner(name) opens the miner drawer. Between races the popover also renames it:
// onRenameMiner(name, next) -> { success, error } for this session. perMiner: { [name]: progress }
// of the running or the last race, with each miner's newest attempts (`stream`).
// During a race "All streams" shows every miner's attempts side by side.

// The "M" key presses the button that announces it (aria-keyshortcuts="M"): Mining between
// races, "Re-mine block #K" during a repair. It stays off while the learner types, with a
// modifier held, on key repeat and while a dialog is open.
function isTyping(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}
function useMineKey(action) {
  const latest = useRef(action);
  useEffect(() => { latest.current = action; });
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key !== 'm' && event.key !== 'M') return;
      if (event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      if (!latest.current) return;
      event.preventDefault();
      latest.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}

function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  const fixed = value.toFixed(8).replace(/0+$/, '');
  const [whole, fraction = ''] = fixed.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
const count = value => Number(value ?? 0).toLocaleString('en-US');
// From three miners on the lanes get slimmer, so the cards below keep their lists.
const lanesClass = miners => `next-block-lanes${miners.length > 2 ? ' is-compact' : ''}`;
const seconds = ms => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s`;
const minerColor = miner => miner.color ?? colorOf(miner.name) ?? 'var(--text-3)';

const BoltIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5L3 9h4.5l-1 5.5L13 7H8.5z" fill="currentColor" /></svg>
);
const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="3" y="2.5" width="2" height="7" rx=".6" fill="currentColor" /><rect x="7" y="2.5" width="2" height="7" rx=".6" fill="currentColor" /></svg>
);
const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l8 5-8 5z" fill="currentColor" /></svg>
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

function Track({ zeros, difficulty, label, hintProps = null }) {
  const reached = Math.max(0, Math.min(zeros ?? 0, difficulty));
  const pct = difficulty > 0 ? (reached / difficulty) * 100 : 0;
  const ticks = Array.from({ length: Math.max(0, difficulty - 1) }, (_, i) => ((i + 1) / difficulty) * 100);
  return (
    <div className="next-block-track" role="img" aria-label={label} {...hintProps}>
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
  mode = 'idle', index, txCount = 0, reward, difficulty = 2, onDifficulty, autoMine = false, onAutoMine, repeating = false,
  onStartDemo, onMine, onPause, onRemine, repair = null, miners = [], race = null, lastRound = null,
  backedMiner = null, onBack, coach = null, signature = null, onCreateMiner, minersFull = false, onRenameMiner, onShare, onOpenMiner, perMiner = {},
  slowMotion = false, onSlowMotion
}) {
  const isMining = mode === 'mining';
  const isRepair = mode === 'repair';
  const isFresh = mode === 'fresh';
  const isPaused = mode === 'paused';
  const settingsLocked = isMining || isRepair;
  const target = '0'.repeat(difficulty);
  const [liveOpen, setLiveOpen] = useState(null);
  const [wall, setWall] = useState(false);

  const meta = isFresh ? '· Genesis only'
    : `· ${txCount} tx${isMining ? '' : ' selected'}${reward != null ? ` · reward ${formatAmount(reward)}` : ''}`;
  let headStatus = null;
  if (isMining) headStatus = slowMotion ? (
    <span className="next-block-slow" role="status">
      <span className="card-kit-pill is-pending"><i aria-hidden="true" />Slow motion · {Math.round(1000 / SLOW_MS)} tries/s</span>
      {onSlowMotion && <button type="button" className="card-kit-btn is-sm" {...hint('next.normal-speed')} onClick={() => onSlowMotion(false)}>Normal speed</button>}
    </span>
  ) : <span className="card-kit-pill is-live"><i aria-hidden="true" />Mining block #{index}…</span>;
  if (isPaused) headStatus = <span className="card-kit-pill is-none"><PauseIcon />Paused</span>;
  const headAside = isRepair
    ? <span className="next-block-paused" role="status"><PauseIcon />Paused while the chain is invalid</span>
    : null;

  const repeatToggle = (
    <RepeatToggle name="Auto-mine" pressed={autoMine} onToggle={onAutoMine} disabled={isRepair} hint={hint('next.auto-mine', autoMine)} />
  );
  const stepper = (
    <CoachMark target="workbench.difficulty" coach={coach} className="next-block-coach-inline">
      <span className={`next-block-stepper${settingsLocked ? ' is-locked' : ''}`}>
        <span {...term('next.difficulty', isMining ? 'mining' : isRepair ? 'repair' : null)}>Difficulty</span>
        <span className="next-block-stepper-box">
          <button type="button" aria-label="Lower difficulty" disabled={settingsLocked || difficulty <= MIN_DIFFICULTY}
            {...hint('next.lower', !isFresh)} onClick={() => onDifficulty?.(difficulty - 1)}><MinusIcon /></button>
          <output aria-label="Difficulty">{difficulty}</output>
          <button type="button" aria-label="Raise difficulty" disabled={settingsLocked || difficulty >= MAX_DIFFICULTY}
            {...hint('next.raise')} onClick={() => onDifficulty?.(difficulty + 1)}><PlusIcon /></button>
        </span>
      </span>
    </CoachMark>
  );

  const running = isMining || (repeating && !isRepair);
  const startsDemo = isFresh;
  const repairNext = repair?.next ?? repair?.order?.[0];
  useMineKey(isRepair
    ? (repair && !repair.undoOnly && repairNext !== undefined ? () => onRemine?.(repairNext) : null)
    : (!running && !startsDemo ? () => onMine?.() : null));
  // Keep the same button mounted so keyboard focus follows Play → Pause → Play.
  const action = (
    <CoachMark target={running || isRepair || startsDemo ? undefined : "workbench.mine"} coach={running || isRepair || startsDemo ? null : coach} className="next-block-coach-inline">
      <button type="button" className={isRepair ? 'card-kit-btn is-lg' : 'btn-primary'}
        disabled={isRepair} {...hint(isRepair ? 'next.mine-locked' : running ? 'next.pause' : startsDemo ? 'next.start-demo' : 'next.mine')}
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
        <h2 className="next-block-title" {...term('next.title')}>Next block #{index}</h2>
        <span className="next-block-meta">{meta}</span>
        {headStatus}
        {headAside}
      </div>
      {signature}
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
          ? <LiveRace miners={miners} race={race} index={index} difficulty={difficulty} target={target} backedMiner={backedMiner} coach={coach}
            onShare={onShare} onOpenMiner={onOpenMiner} open={liveOpen} setOpen={setLiveOpen} wall={wall} setWall={setWall} />
          : <LastRound miners={miners} lastRound={lastRound} race={isPaused ? race : null} difficulty={difficulty}
            backedMiner={backedMiner} onBack={onBack} coach={coach} isFresh={isFresh}
            onCreateMiner={onCreateMiner} minersFull={minersFull} onRenameMiner={onRenameMiner} onShare={onShare} onOpenMiner={onOpenMiner} perMiner={perMiner} />}
    </section>
  );
}

// The name field of a miner's popover between races: a display name for this session.
function MinerNameField({ miner, onRename, onDone }) {
  const id = useId();
  const [draft, setDraft] = useState(miner.name);
  const [error, setError] = useState('');
  const commit = () => {
    const next = draft.trim();
    if (next === miner.name) return true;
    const result = onRename?.(miner.name, next) ?? { success: false, error: 'This miner cannot be renamed.' };
    if (!result.success) { setError(result.error || 'This name is not available.'); return false; }
    setError('');
    return true;
  };
  return (
    <div className="next-block-editor-field">
      <label htmlFor={`${id}-name`}>Name</label>
      <input id={`${id}-name`} className="card-kit-input" value={draft} maxLength={16} autoComplete="off" spellCheck={false}
        aria-invalid={error ? 'true' : 'false'} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (commit()) onDone(); } }} />
      {error && <p className="card-kit-error next-block-editor-error" role="alert" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

function LastRound({ miners, lastRound, race, difficulty, backedMiner, onBack, coach, isFresh, onCreateMiner, minersFull, onRenameMiner, onShare, onOpenMiner, perMiner }) {
  const [creating, setCreating] = useState(false);
  // The miner whose editor is open, by its position: a rename keeps the editor on it.
  const [editing, setEditing] = useState(null);
  const editable = Boolean(onRenameMiner || onShare || onOpenMiner);
  const d = lastRound?.difficulty ?? difficulty;
  const coached = coach?.target === 'workbench.back-miner';
  let summary;
  if (race) {
    summary = <>Paused after <b>{count(race.attempts)}</b> attempts · <b>{seconds(race.elapsedMs)}</b>. Mining again starts a new search.</>;
  } else if (lastRound) {
    summary = <>Last round #{lastRound.index}: <span className="next-block-winner" style={{ color: minerColor(miners.find(m => m.name === lastRound.winner) ?? { name: lastRound.winner }) }}>{lastRound.winner}</span> won at nonce <b>{count(lastRound.nonce)}</b> · <b>{count(lastRound.attempts)}</b> tries · <b>{seconds(lastRound.elapsedMs)}</b></>;
  } else {
    summary = isFresh
      ? <>Start demo mines block #1 and shares its reward with the other wallets; the transfers wait for #2.</>
      : <>No round yet. Mine a block to watch the miners race.</>;
  }
  return (
    <div className="next-block-body" data-round="last">
      <div className="next-block-summary">{summary}</div>
      <CoachMark target="workbench.back-miner" coach={coach} className="next-block-coach-block">
        <div className={lanesClass(miners)}>
          {miners.map((miner, index) => {
            const result = race?.perMiner?.[miner.name] ?? lastRound?.perMiner?.[miner.name] ?? null;
            const isWinner = !race && lastRound?.winner === miner.name;
            const backed = backedMiner === miner.name;
            const zeros = result ? Math.min(result.zeros ?? 0, d) : 0;
            const open = editing === index;
            const who = <><Avatar miner={miner} /><span className="next-block-nm"><b>{miner.name}</b>
              <small>{result ? <>nonce {count(result.nonce)} · {isWinner ? <em className="is-win">{zeros}/{d} zeros</em> : `${zeros}/${d} zeros`}</> : 'no round yet'}
                {backed && <> · <em className="is-backed">backed</em></>}</small></span></>;
            return (
              <div key={index} className="next-block-lane-wrap">
              <div className={`next-block-lane${isWinner ? ' is-winner' : ''}${backed ? ' is-backed' : ''}${open ? ' is-editing' : ''}`}
                style={{ '--miner-color': minerColor(miner) }} data-miner={miner.name}>
                {editable ? (
                  <button type="button" className="next-block-who is-button" aria-expanded={open} {...hint('next.miner', miner.name)}
                    aria-label={`${miner.name}: hashpower, attempts and name`} onClick={() => setEditing(open ? null : index)}>{who}</button>
                ) : <div className="next-block-who">{who}</div>}
                <Track zeros={zeros} difficulty={d} hintProps={hint('next.progress')}
                  label={result ? `${miner.name} reached ${zeros} of ${d} leading zeros` : `${miner.name} has not raced yet`} />
                <div className="next-block-lane-end">
                  <button type="button" className={`card-kit-btn is-sm${backed ? ' is-pressed' : coached ? '' : ' is-ghost'}`}
                    aria-pressed={backed ? 'true' : 'false'} {...hint('next.back', miner.name, backed)} onClick={() => onBack?.(backed ? null : miner.name)}>
                    {backed && <CheckIcon />}Back {miner.name}
                  </button>
                </div>
              </div>
              {open && (
                <MinerPopover miner={miner} miners={miners} progress={perMiner?.[miner.name]} difficulty={d} onShare={onShare}
                  onOpenDetails={onOpenMiner} onClose={() => setEditing(null)}>
                  {onRenameMiner && <MinerNameField key={miner.name} miner={miner} onRename={onRenameMiner} onDone={() => setEditing(null)} />}
                </MinerPopover>
              )}
              </div>
            );
          })}
        </div>
      </CoachMark>
      {creating && !minersFull && (
        <div className="next-block-create">
          <CreateNameForm noun="miner" label="New miner name" placeholder="New miner, e.g. Hal"
            hint="A simulated miner: races from the next block with an equal share of the hashpower, starts at 0."
            onCreate={onCreateMiner} onCancel={() => setCreating(false)} />
        </div>
      )}
      <div className="next-block-foot">
        {onCreateMiner && (
          <span className="hint-wrap next-block-new-wrap" {...hint('next.create-miner', minersFull)}>
            <button type="button" className="next-block-new" aria-expanded={creating && !minersFull} disabled={minersFull}
              onClick={() => setCreating(open => !open)}><PlusIcon />Create miner</button>
          </span>
        )}
      </div>
    </div>
  );
}

function LiveMinerLane({ miner, p, difficulty, isWinner, backed, open = false, onOpen }) {
  const zeros = Math.min(p?.zeros ?? 0, difficulty);
  const peak = usePeakHold(Math.min(p?.peakZeros ?? zeros, difficulty), p?.iterations ?? -1);
  const st = zeroStatus(zeros, difficulty, isWinner);
  const who = <><Avatar miner={miner} /><span className="next-block-nm"><b>{miner.name}</b>
    <small>nonce {p ? count(p.nonce) : '–'}{backed && <> · <em className="is-backed">backed</em></>}</small></span></>;
  return (
    <div className={`next-block-lane is-live${isWinner ? ' is-winner' : ''}${backed ? ' is-backed' : ''}${open ? ' is-editing' : ''}`}
      style={{ '--miner-color': minerColor(miner) }} data-miner={miner.name}>
      {onOpen ? (
        <button type="button" className="next-block-who is-button" aria-expanded={open} {...hint('next.miner', miner.name)}
          aria-label={`${miner.name}: hashpower and attempts`} onClick={onOpen}>{who}</button>
      ) : <div className="next-block-who">{who}</div>}
      <div className="next-block-live" {...hint('next.live-progress')}>
        <CheckedHash hash={p?.hash} difficulty={difficulty} />
        <Track zeros={peak} difficulty={difficulty} label={`${miner.name} recent peak ${peak} of ${difficulty} leading zeros`} />
      </div>
      <div className="next-block-lane-end"><span className={`card-kit-pill ${st.cls}`}>{st.dot && <i aria-hidden="true" />}{st.text}</span></div>
    </div>
  );
}

// `open` (the miner whose popover is open) and `wall` live in the card, so they stay through
// the blocks of an Auto-mine run, when each new race mounts LiveRace again.
function LiveRace({ miners, race, index, difficulty, target, backedMiner, coach, onShare, onOpenMiner, open, setOpen, wall, setWall }) {
  const targetSeconds = race?.targetSeconds;
  const elapsed = race?.elapsedMs ?? 0;
  const timePct = targetSeconds ? Math.min(100, (elapsed / 1000 / targetSeconds) * 100) : 0;
  return (
    <div className="next-block-body" data-round="live">
      <div className="next-block-summary">Live round #{index}: the first hash that starts with <span className="next-block-tgt">{target}</span> wins · every try is a new nonce</div>
      {/* While a race runs, the "watch the race" step points at the lanes, not at the disabled button. */}
      <CoachMark target="workbench.mine" coach={coach} className="next-block-coach-block">
      <CoachMark target="workbench.back-miner" coach={coach} className="next-block-coach-block">
        <div className={lanesClass(miners)}>
          {miners.map(miner => (
            <div key={miner.name} className="next-block-lane-wrap">
              <LiveMinerLane miner={miner} p={race?.perMiner?.[miner.name]} difficulty={difficulty} isWinner={race?.winner === miner.name}
                backed={backedMiner === miner.name} open={open === miner.name}
                onOpen={onShare || onOpenMiner ? () => setOpen(current => (current === miner.name ? null : miner.name)) : undefined} />
              {open === miner.name && (
                <MinerPopover miner={miner} miners={miners} progress={race?.perMiner?.[miner.name]} difficulty={difficulty}
                  onShare={onShare} onOpenDetails={onOpenMiner} onClose={() => setOpen(null)} />
              )}
            </div>
          ))}
        </div>
      </CoachMark>
      </CoachMark>
      <div className="next-block-foot">
        <span><b>{count(race?.attempts)}</b> attempts · <b>{seconds(elapsed)}</b>{targetSeconds ? <> of the {targetSeconds} s target</> : null}</span>
        {targetSeconds ? <span className="next-block-timebar" role="img" aria-label={`${(elapsed / 1000).toFixed(1)} of ${targetSeconds} seconds`}><i style={{ width: `${timePct}%` }} /></span> : null}
        <button type="button" className="next-block-new" aria-pressed={wall} onClick={() => setWall(on => !on)}
          {...hint('next.all-streams', wall)}>{wall ? 'Hide streams' : 'All streams'}</button>
      </div>
      {wall && <StreamWall miners={miners} perMiner={race?.perMiner} difficulty={difficulty} onShare={onShare} onOpenDetails={onOpenMiner} />}
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
          <span className="next-block-order" aria-label={`Re-mine order, ${done} of ${order.length} done`} {...hint('next.repair-order')}>
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
          <button type="button" className="btn-primary" {...hint('next.undo-edit')} onClick={() => repair.onUndo?.(next)}><UndoIcon />Undo edit in block #{next}</button>
          <small>{issueText(repair.reason ?? 'signature', repair.stuck ?? next)} Re-mining changes no transaction, so it cannot fix this.</small>
          {repair.signatureTest != null && <CoachMark target="workbench.signature-test" coach={coach}>
            <button type="button" className="card-kit-btn is-ghost" {...hint('next.signature-test')} onClick={() => onRemine?.(repair.signatureTest)}>Test proof of work anyway</button>
          </CoachMark>}
        </div>
        : <CoachMark target="workbench.remine" coach={coach} className="next-block-coach-block">
          <div className="next-block-repair-row">
            <button type="button" className="btn-primary" aria-keyshortcuts="M" {...hint('next.remine', next, target)} onClick={() => onRemine?.(next)}><BoltIcon />Re-mine block #{next}</button>
            <small>Finds a new nonce so #{next} starts with {target} again.{then}</small>
          </div>
        </CoachMark>}
      <div className="next-block-foot">
        <span>Each re-mine is a full race at difficulty {difficulty}.</span>
      </div>
    </div>
  );
}
