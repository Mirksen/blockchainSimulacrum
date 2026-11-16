import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChainBand } from './ChainBand';
import { ChainTimeline } from './ChainTimeline';
import { ChainViewSwitch } from './ChainViewSwitch';
import { SelectedBlockCard } from './SelectedBlockCard';
import { NextBlockCard } from './NextBlockCard';
import { MinerName } from './MinerName';
import { WalletsCard } from './WalletsCard';
import { MempoolCard } from './MempoolCard';
import { ActivityCard } from './ActivityCard';
import { BlockTransactions } from './BlockTransactions';
import { buildBlockViews } from './blockView';
import { readChainView, storeChainView } from '../../lib/chainView';
import { useSessionSnapshot } from '../../hooks/useWorkbenchSession';
import { chainEventsOf, keyFiguresOf, repairOf } from './workbenchModel';
import { rateOf } from './minerDetailsModel';
import { ChainEventNotes, KeyFigureBar } from './KeyFigures';
import { eventNote } from './keyFigureText';
import { colorOf } from './minerColors';
import './Workbench.css';

// The workbench view (web/DESIGN.md, "Information architecture"): chain band and
// card grid; App frames it with the mission rail. It turns the snapshot of the workbench
// session (lib/workbenchSession.js) into the view models of the presentational components,
// whose controls call the session's actions. It owns only view state: the selected or held
// block, the block a repair is about, the open chain checks, dismissed notes, the arrival of
// a found block and the chain view. `onOpen({ kind: 'block' | 'transaction' | 'wallet' |
// 'miner', ... })` opens details, `onNavigate(view)` another view.

// Below 1024 px the chain band turns compact, or, switched to the list, the chain
// stands as a vertical list; either scrolls with the page under the ticker.
const NARROW = '(max-width: 1023.98px)';
const subscribeNarrow = notify => {
  const query = globalThis.matchMedia?.(NARROW);
  query?.addEventListener?.('change', notify);
  return () => query?.removeEventListener?.('change', notify);
};
const isNarrow = () => Boolean(globalThis.matchMedia?.(NARROW).matches);

// View state that outlives a visit to a lab, for as long as its session: a reset forgets it.
const memories = new WeakMap();
function memoryOf(session) {
  let memory = memories.get(session);
  if (!memory) {
    memory = new Map();
    memories.set(session, memory);
    session.subscribe(events => { if (events.some(event => event.type === 'reset')) memory.clear(); });
  }
  return memory;
}
function useViewState(session, key, initial) {
  const memory = memoryOf(session);
  const [value, setValue] = useState(() => (memory.has(key) ? memory.get(key) : typeof initial === 'function' ? initial() : initial));
  useEffect(() => { memory.set(key, value); }, [memory, key, value]);
  return [value, setValue];
}

// A signed coinbase names its miner in the memo and commits to it in a last output.
const signerOf = coinbase => (coinbase.outputs.some(output => output.kind === 'commitment') ? coinbase.memo : null);

function WorkbenchNotes({ events, blocks, halvingInterval, targetSeconds, coinName, blockMoment, dismissed, onDismiss }) {
  // Restore only recent explanations, then keep each new one for its own lifetime.
  // The first block keys this component, so a reset starts a fresh notice window.
  const [after] = useState(() => blocks.length - 4);
  const notes = Object.values(events).flat()
    .filter(event => event.index > after)
    .map(event => {
      const note = eventNote(event, { halvingInterval, targetSeconds, coinName });
      return note && { ...note, change: event, motion: blockMoment?.changes.find(change => change.kind === event.kind && change.index === event.index), key: `${note.key}@${blocks[event.index - 1]?.hash}` };
    })
    .filter(note => note && !dismissed?.has(note.key));
  return notes.length > 0 && <aside className="wb-notes" aria-label="What changed"><ChainEventNotes notes={notes} onDismiss={onDismiss} /></aside>;
}

export function Workbench({ session, coinName, identity, boardRows, coach, onOpen, onNavigate }) {
  const { actions } = session;
  const { blocks, blockStatus, participants, memPool, balances, tamperedEdits, describeTx, previewTransaction, blockTemplate: template, difficulty, blockReward,
    halvingInterval, targetSeconds, nextBlock, loweringStartsNewChain, canAddMiner, chainValid, run, progress, raceWinner, backedMiner, settings, repeating,
    lastRound, error } = useSessionSnapshot(session);
  const busy = run.kind !== 'idle';
  // A new block is being mined (Play, Auto-mine or the demo), not a historical one re-mined.
  const minesNew = run.kind === 'mining' || run.kind === 'setup';
  const remining = run.kind === 'remining' ? run.index : null;
  const [selectedIndex, setSelectedIndex] = useViewState(session, 'selected', null);
  // The block a repair is about: shown while the chain is invalid, never held.
  const [repairFocus, setRepairFocus] = useViewState(session, 'repair', null);
  const [healthOpen, setHealthOpen] = useViewState(session, 'health', false);
  // Acknowledged or expired notes stay gone when the learner returns from a lab.
  const [dismissedNotes, setDismissedNotes] = useViewState(session, 'dismissed', () => new Set());
  // A live accepted block, distinct from restored history and historical repairs.
  const [blockMoment, setBlockMoment] = useState(null);
  useEffect(() => session.subscribe(events => {
    for (const event of events) {
      if (event.type === 'block-accepted') {
        setBlockMoment({ hash: event.block.hash, index: event.index,
          changes: event.demo ? [] : [event.retarget && { kind: 'difficulty', index: event.index + 1, from: event.retarget.from, to: event.retarget.to },
            event.halved && { kind: 'halving', index: event.index }].filter(Boolean) });
      } else if (event.type === 'block-tampered' && event.applied) {
        // Only an edit the chain applied opens the repair and the chain checks.
        setRepairFocus(event.blockIndex);
        setHealthOpen(true);
      } else if (event.type === 'block-remined') {
        setRepairFocus(event.blockIndex);
      } else if (event.type === 'reset') {
        setSelectedIndex(null);
        setRepairFocus(null);
        setBlockMoment(null);
        setDismissedNotes(new Set());
      }
    }
  }), [session, setSelectedIndex, setRepairFocus, setHealthOpen, setDismissedNotes]);
  useEffect(() => {
    if (!blockMoment) return;
    const timer = setTimeout(() => setBlockMoment(null), 2400);
    return () => clearTimeout(timer);
  }, [blockMoment]);
  // Nothing clicked follows the newest block; a click holds a block until it is clicked again.
  const onSelect = index => {
    setRepairFocus(null);
    setSelectedIndex(current => (current === index ? null : index));
  };
  const onToggleHealth = () => setHealthOpen(open => !open);
  const onDismissNote = key => setDismissedNotes(current => new Set(current).add(key));
  const openChainLab = () => onNavigate?.('chain-lab');
  const openMiner = name => onOpen?.({ kind: 'miner', name });
  // A repair shows its block only while the chain is invalid; a click on a tile outranks it.
  const shownIndex = !chainValid && repairFocus !== null ? repairFocus : selectedIndex;
  const held = shownIndex !== null && shownIndex === selectedIndex;
  const compact = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const [chainView, setChainView] = useState(readChainView);
  const showList = compact && chainView === 'list';
  // Switching representation is no new block (returning to the workbench mounts without one).
  const [momentCompact, setMomentCompact] = useState(compact);
  if (momentCompact !== compact) {
    setMomentCompact(compact);
    setBlockMoment(null);
  }
  const switchView = view => { setBlockMoment(null); setChainView(view); storeChainView(view); };
  const height = blocks.length - 1;
  const fresh = height === 0 && memPool.length === 0 && !busy;
  const views = useMemo(() => buildBlockViews({ blocks, blockStatus, participants, tamperedEdits }),
    [blocks, blockStatus, participants, tamperedEdits]);
  const repair = repairOf(blockStatus, tamperedEdits);
  // The existing re-mine API accepts this block, but correctly refuses any
  // descendants of an invalid signature. Test only the tip; validity never changes.
  const signatureTest = repair?.undoOnly && repair.reason === 'signature' && repair.stuck === height &&
    blockStatus.slice(0, height).every(check => check.status === 'valid') &&
    blockStatus[height]?.status === 'hash-mismatch' ? height : null;
  const keyFigures = keyFiguresOf({ blocks, difficulty, blockReward, nextBlock, halvingInterval, targetSeconds });
  const events = useMemo(() => chainEventsOf({ blocks, difficulty }), [blocks, difficulty]);
  const nextIndex = blocks.length;
  const repairIndex = busy ? remining : repair?.next;
  const nextCardCount = repairIndex != null ? Math.max(0, blocks[repairIndex].transactions.length - 1) : template.included.length;

  const mode = busy ? 'mining' : fresh ? 'fresh' : repair ? 'repair' : 'idle';
  const candidate = {
    index: nextIndex, txCount: template.included.length,
    state: minesNew ? 'mining' : repair ? 'paused' : fresh ? 'fresh' : 'idle',
    elapsedMs: progress.total?.elapsedMs, attempts: progress.total?.iterations, slow: busy && settings.slowMotion
  };
  const miners = participants.filter(p => p.isMiner && p.minerEnabled)
    .map(p => ({ name: p.name, hashpower: p.hashpower, color: colorOf(p.colorKey) ?? undefined }));
  const race = busy ? {
    perMiner: progress.perMiner, attempts: progress.total?.iterations ?? 0, elapsedMs: progress.total?.elapsedMs ?? 0,
    targetSeconds, winner: raceWinner
  } : null;
  // One rate rule (minerDetailsModel.rateOf): a miner's smoothed rate of the running race, else
  // of the last round; none before its first race.
  const rateFor = name => {
    const last = progress.perMiner[name] ?? lastRound?.perMiner?.[name];
    return last ? rateOf(last) : undefined;
  };

  const selected = shownIndex !== null && blocks[shownIndex] ? shownIndex : height;
  const pinned = held && selected === shownIndex;
  const block = blocks[selected];
  const selectedView = views[selected];
  const selectedBlock = block ? {
    index: selected, hash: block.hash, previousHash: block.previousHash, txRoot: block.txRoot, anchor: selectedView?.anchor ?? null, nonce: block.nonce, difficulty: block.difficulty,
    isNewest: selected === height && selected > 0, miner: selectedView?.isGenesis ? null : selectedView?.minerName, minerKey: selectedView?.minerKey,
    seconds: selectedView?.seconds, tries: lastRound?.index === selected ? lastRound.attempts : undefined,
    reward: describeTx(block.transactions[0]).amount, signedBy: signerOf(describeTx(block.transactions[0])),
    transactions: block.transactions.map(tx => {
      const view = describeTx(tx);
      return { from: view.from, to: view.to, amount: view.amount, reference: view.memo, spentIn: view.outputs[0]?.spentIn };
    })
  } : null;
  const edits = tamperedEdits.filter(edit => edit.blockIndex === selected);

  // Miners first, then the other wallets in their creation order.
  const wallets = [...balances].sort((a, b) => Number(b.isMiner) - Number(a.isMiner)).map(wallet => {
    const participant = participants.find(p => p.publicKey === wallet.publicKey);
    return { name: wallet.name, balance: wallet.balance, isMiner: wallet.isMiner, blocksWon: participant?.blocksWon ?? 0, colorKey: participant?.colorKey,
      hashrate: wallet.isMiner ? rateFor(wallet.name) : undefined };
  });
  // The mempool as the next block's miner sees it: what fits first, in block order, then
  // what waits, the highest fee rate first (blockTemplate in lib/blockchain.js).
  const pending = [...template.included, ...template.waiting].map(index => {
    const tx = memPool[index];
    const view = describeTx(tx);
    const entry = template.entries[index];
    return { id: view.txid, tx, from: view.from, to: view.to, amount: view.amount, reference: view.memo, inputs: view.inputs.length,
      change: view.change, fee: view.fee, size: view.size, rate: entry?.rate ?? null, waits: template.reasons[index] ?? null };
  });
  const space = { bytes: template.bytes, capacity: template.space, included: template.included.length, total: memPool.length };
  const pendingFees = template.fees / 1e8;
  const confirmed = useMemo(() => {
    const recent = [];
    for (let index = blocks.length - 1; index > 0 && recent.length < 12; index--) {
      for (const tx of blocks[index].transactions) {
        const view = describeTx(tx);
        recent.push({ blockIndex: index, label: `${view.coinbase ? 'Coinbase' : view.from} → ${view.to}`, amount: view.amount });
        if (recent.length === 12) break;
      }
    }
    return recent;
  }, [blocks, describeTx]);
  const blockTimes = useMemo(() => {
    const recent = [];
    for (let index = views.length - 1; index > 0 && recent.length < 8; index--) {
      const view = views[index];
      if (view.seconds !== null) recent.push({ index: view.index, seconds: view.seconds });
    }
    return recent;
  }, [views]);
  const workbenchCoach = coach?.view === 'workbench' ? coach : null;
  const selectedTransactions = selectedBlock ? (blocks[selected]?.transactions ?? []).map(describeTx) : [];
  const repairOrder = repair && !repair.undoOnly ? repair.order : [];

  return (
    <>
    {error && <div role="alert" className="wb-error">{error}</div>}
    <KeyFigureBar keyFigures={keyFigures} height={height} />
    <div className={`wb-band${showList ? ' is-list' : ''}`}>
      {showList ? (
        <ChainTimeline views={fresh ? views.slice(0, 1) : views} candidate={candidate} selectedIndex={selected} pinned={pinned} onSelect={onSelect}
          onOpenChainLab={openChainLab} keyFigures={keyFigures} foundHash={blockMoment?.hash} healthOpen={healthOpen} onToggleHealth={onToggleHealth}
          coach={workbenchCoach} repairOrder={repairOrder} viewSwitch={<ChainViewSwitch view="list" onChange={switchView} />} />
      ) : (
        <ChainBand views={fresh ? views.slice(0, 1) : views} candidate={candidate} selectedIndex={selected} pinned={pinned} onSelect={onSelect}
          keyFigures={keyFigures} events={fresh ? {} : events} foundHash={blockMoment?.hash} healthOpen={healthOpen} onToggleHealth={onToggleHealth}
          coach={workbenchCoach} repairOrder={repairOrder} compact={compact}
          viewSwitch={compact ? <ChainViewSwitch view="row" onChange={switchView} /> : null} />
      )}
    </div>
    <div className="wb-grid">
      <div className="wb-selected">
        <SelectedBlockCard block={selectedBlock} status={blockStatus[selected]} prevHash={blocks[selected - 1]?.hash ?? null}
          edit={edits.length ? edits : null} onOpenDetails={index => onOpen?.({ kind: 'block', index })} onOpenChainLab={openChainLab}
          onTamper={actions.tamper} onUndo={actions.undo} coach={workbenchCoach}>
          <BlockTransactions key={`transactions-${selected}`} transactions={selectedTransactions} editedTx={edits.map(edit => edit.txIndex)}
            onProve={transactionIndex => onOpen?.({ kind: 'proof', blockIndex: selected, transactionIndex })}
            onOpenDetails={view => onOpen?.({ kind: 'transaction', view, blockIndex: selected })} />
        </SelectedBlockCard>
      </div>
      <div className="wb-next">
        <NextBlockCard mode={mode} index={repairIndex ?? nextIndex} txCount={nextCardCount}
          reward={nextBlock.subsidy / 1e8} difficulty={difficulty} onDifficulty={actions.setDifficulty} loweringStartsNewChain={loweringStartsNewChain} autoMine={settings.autoMine} onAutoMine={actions.setAutoMine} repeating={repeating}
          onStartDemo={actions.startDemo} onMine={actions.mine} onPause={actions.pause} onRemine={actions.remine}
          repair={repair ? { ...repair, onUndo: actions.undo, signatureTest } : null} miners={miners} race={race} lastRound={lastRound}
          backedMiner={backedMiner} onBack={actions.backMiner} coach={workbenchCoach}
          onCreateMiner={actions.createMiner} onRenameMiner={actions.renameMiner} onShare={actions.setMinerShare} onOpenMiner={openMiner} perMiner={progress.perMiner} slowMotion={busy && settings.slowMotion} onSlowMotion={actions.setSlowMotion} minersFull={!canAddMiner}
          signature={<MinerName identity={identity} rows={boardRows} locked={busy} />} />
      </div>
      <div className="wb-wallets">
        <WalletsCard wallets={wallets} coinName={coinName} onOpenWallet={name => onOpen?.({ kind: 'wallet', name })} onCreateWallet={actions.createWallet} />
      </div>
      <div className="wb-mempool">
        <MempoolCard transactions={pending} space={space} nextIndex={nextIndex} mining={minesNew} remining={remining} participants={participants.map(p => p.name)}
          coinName={coinName} reward={nextBlock.subsidy / 1e8 + pendingFees} onCreateTransaction={actions.createTransaction}
          onPreviewTransaction={previewTransaction} onOpenTransaction={tx => onOpen?.({ kind: 'transaction', tx, blockIndex: null })}
          autoTransact={settings.autoTransact} onAutoTransact={actions.setAutoTransact}
          newTxGlow={!busy && !repair && !fresh} coach={workbenchCoach} />
      </div>
      <div className="wb-activity">
        <ActivityCard confirmed={confirmed} blockTimes={blockTimes} targetSeconds={targetSeconds} />
      </div>
    </div>
    <WorkbenchNotes key={blocks[1]?.hash ?? 'fresh'} events={events} blocks={blocks} halvingInterval={halvingInterval}
      targetSeconds={targetSeconds} coinName={coinName} blockMoment={blockMoment} dismissed={dismissedNotes} onDismiss={onDismissNote} />
    </>
  );
}

