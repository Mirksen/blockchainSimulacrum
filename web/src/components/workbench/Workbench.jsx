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
import { MAX_MINERS } from '../../lib/blockchain';
import { readChainView, storeChainView } from '../../lib/chainView';
import { chainEventsOf, keyFiguresOf, rateOf, repairOf } from './workbenchModel';
import { ChainEventNotes, KeyFigureBar } from './KeyFigures';
import { eventNote } from './keyFigureText';
import { colorOf } from './minerColors';
import './Workbench.css';

// The workbench view (web/DESIGN.md, "Information architecture"): chain band and
// card grid; App frames it with the mission rail. It turns the simulation snapshot
// into the view models of the presentational components; App owns state and effects.

// Below 1024 px the chain band turns compact, or, switched to the list, the chain
// stands as a vertical list; either scrolls with the page under the ticker.
const NARROW = '(max-width: 1023.98px)';
const subscribeNarrow = notify => {
  const query = globalThis.matchMedia?.(NARROW);
  query?.addEventListener?.('change', notify);
  return () => query?.removeEventListener?.('change', notify);
};
const isNarrow = () => Boolean(globalThis.matchMedia?.(NARROW).matches);

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

export function Workbench({
  sim, coinName, targetSeconds, autoMine, onAutoMine, repeating = false, autoTransact, onAutoTransact, selectedIndex, held = false, onSelect, healthOpen, onToggleHealth,
  lastRound, blockMoment = null, onClearBlockMoment, dismissedNotes, onDismissNote, remining, coach, identity, boardRows,
  onStartDemo, onMine, onPause, onRemine, onTamper, onUndo, onDifficulty, onBack,
  onCreateTransaction, onCreateWallet, onCreateMiner, onRenameMiner, onShare, onOpenMiner, onSlowMotion, onOpenWallet, onOpenDetails, onOpenTransaction, onOpenBlockTx, onOpenChainLab, error
}) {
  const { blocks, blockStatus, participants, memPool, balances, tamperedEdits, describeTx, previewTransaction, blockTemplate, difficulty, blockReward, halvingInterval,
    isMining, isSettingUp, minerProgress, miningProgress, raceWinner, backedMiner, slowMotion = false } = sim;
  const busy = isMining || isSettingUp;
  const compact = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const [chainView, setChainView] = useState(readChainView);
  const showList = compact && chainView === 'list';
  // Switching representation or returning to the workbench is no new block.
  useEffect(() => { onClearBlockMoment?.(); }, [compact, onClearBlockMoment]);
  const switchView = view => { onClearBlockMoment?.(); setChainView(view); storeChainView(view); };
  const height = blocks.length - 1;
  const fresh = height === 0 && memPool.length === 0 && !busy;
  const views = useMemo(() => buildBlockViews({ blocks, blockStatus, participants, tamperedEdits }),
    [blocks, blockStatus, participants, tamperedEdits]);
  const repair = repairOf(blockStatus, tamperedEdits);
  const keyFigures = keyFiguresOf({ blocks, difficulty, blockReward, halvingInterval, targetSeconds });
  const events = useMemo(() => chainEventsOf({ blocks, difficulty, targetSeconds }), [blocks, difficulty, targetSeconds]);
  const nextIndex = blocks.length;
  const template = blockTemplate ?? { included: memPool.map((_, i) => i), waiting: [], reasons: {}, entries: [], bytes: 0, space: 0, fees: 0 };
  const repairIndex = busy ? remining : repair?.next;
  const nextCardCount = repairIndex != null ? Math.max(0, blocks[repairIndex].transactions.length - 1) : template.included.length;

  const mode = busy ? 'mining' : fresh ? 'fresh' : repair ? 'repair' : 'idle';
  const candidate = {
    index: nextIndex, txCount: template.included.length,
    state: busy && remining === null ? 'mining' : repair ? 'paused' : fresh ? 'fresh' : 'idle',
    elapsedMs: miningProgress?.elapsedMs, attempts: miningProgress?.iterations, slow: busy && slowMotion
  };
  const miners = participants.filter(p => p.isMiner && p.minerEnabled)
    .map(p => ({ name: p.name, hashpower: p.hashpower, hashrate: rateOf(minerProgress[p.name]), color: colorOf(p.colorKey) ?? undefined }));
  const race = busy ? {
    perMiner: minerProgress, attempts: miningProgress?.iterations ?? 0, elapsedMs: miningProgress?.elapsedMs ?? 0,
    targetSeconds, winner: raceWinner
  } : null;

  const selected = selectedIndex !== null && blocks[selectedIndex] ? selectedIndex : height;
  const pinned = held && selected === selectedIndex;
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
      hashrate: wallet.isMiner ? rateOf(minerProgress[wallet.name]) : undefined };
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
          onOpenChainLab={onOpenChainLab} keyFigures={keyFigures} foundHash={blockMoment?.hash} healthOpen={healthOpen} onToggleHealth={onToggleHealth}
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
          edit={edits.length ? edits : null} onOpenDetails={onOpenDetails} onOpenChainLab={onOpenChainLab}
          onTamper={onTamper} onUndo={onUndo} coach={workbenchCoach}>
          <BlockTransactions key={`transactions-${selected}`} transactions={selectedTransactions} editedTx={edits.map(edit => edit.txIndex)}
            onOpenDetails={tx => onOpenBlockTx?.(tx, selected)} />
        </SelectedBlockCard>
      </div>
      <div className="wb-next">
        <NextBlockCard mode={mode} index={repairIndex ?? nextIndex} txCount={nextCardCount}
          reward={blockReward} difficulty={difficulty} onDifficulty={onDifficulty} autoMine={autoMine} onAutoMine={onAutoMine} repeating={repeating}
          onStartDemo={onStartDemo} onMine={onMine} onPause={onPause} onRemine={onRemine}
          repair={repair ? { ...repair, onUndo } : null} miners={miners} race={race} lastRound={lastRound}
          backedMiner={backedMiner} onBack={onBack} coach={workbenchCoach}
          onCreateMiner={onCreateMiner} onRenameMiner={onRenameMiner} onShare={onShare} onOpenMiner={onOpenMiner} perMiner={minerProgress} slowMotion={busy && slowMotion} onSlowMotion={onSlowMotion} minersFull={participants.filter(p => p.isMiner).length >= MAX_MINERS}
          signature={<MinerName identity={identity} rows={boardRows} locked={busy} />} />
      </div>
      <div className="wb-wallets">
        <WalletsCard wallets={wallets} coinName={coinName} onOpenWallet={onOpenWallet} onCreateWallet={onCreateWallet} />
      </div>
      <div className="wb-mempool">
        <MempoolCard transactions={pending} space={space} nextIndex={nextIndex} mining={busy} remining={remining} participants={participants.map(p => p.name)}
          coinName={coinName} reward={blockReward + pendingFees} onCreateTransaction={onCreateTransaction}
          onPreviewTransaction={previewTransaction} onOpenTransaction={onOpenTransaction}
          autoTransact={autoTransact} onAutoTransact={onAutoTransact}
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

