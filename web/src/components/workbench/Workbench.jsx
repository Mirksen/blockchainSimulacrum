import { useMemo } from 'react';
import { ChainBand } from './ChainBand';
import { ChainTimeline } from './ChainTimeline';
import { SelectedBlockCard } from './SelectedBlockCard';
import { NextBlockCard } from './NextBlockCard';
import { WalletsCard } from './WalletsCard';
import { MempoolCard } from './MempoolCard';
import { ActivityCard } from './ActivityCard';
import { buildBlockViews } from './blockView';
import { keyFiguresOf, rateOf, repairOf } from './workbenchModel';
import './Workbench.css';

// The workbench view (web/DESIGN.md, "Information architecture"): chain band and
// card grid; App frames it with the mission rail. It turns the simulation snapshot
// into the view models of the presentational components; App owns state and effects.

// A key that belongs to no wallet stays "Unknown"; a plain name (the genesis coinbase's
// recipient) is shown as written.
const nameOf = (participants, key) => key
  ? (participants.find(p => p.publicKey === key)?.name ?? (/^[0-9a-f]{64,}$/i.test(key) ? 'Unknown' : key)) : null;

export function Workbench({
  sim, coinName, targetSeconds, autoMine, onAutoMine, selectedIndex, onSelect, healthOpen, onToggleHealth,
  lastRound, remining, coach,
  onStartDemo, onMine, onPause, onRemine, onTamper, onUndo, onDifficulty, onBack,
  onCreateTransaction, onCreateWallet, onOpenWallet, onOpenDetails, onOpenChainLab, error
}) {
  const { blocks, blockStatus, participants, memPool, balances, tamperedEdits, difficulty, blockReward, halvingInterval,
    isMining, isSettingUp, minerProgress, miningProgress, raceWinner, backedMiner } = sim;
  const busy = isMining || isSettingUp;
  const height = blocks.length - 1;
  const fresh = height === 0 && memPool.length === 0 && !busy;
  const views = useMemo(() => buildBlockViews({ blocks, blockStatus, participants, tamperedEdits }),
    [blocks, blockStatus, participants, tamperedEdits]);
  const repair = repairOf(blockStatus);
  const keyFigures = keyFiguresOf({ blocks, difficulty, blockReward, halvingInterval, targetSeconds });
  const nextIndex = blocks.length;

  const mode = busy ? 'mining' : fresh ? 'fresh' : repair ? 'repair' : 'idle';
  const candidate = {
    index: nextIndex, txCount: memPool.length,
    state: busy && remining === null ? 'mining' : repair ? 'paused' : fresh ? 'fresh' : 'idle',
    elapsedMs: miningProgress?.elapsedMs, attempts: miningProgress?.iterations
  };
  const miners = participants.filter(p => p.isMiner && p.minerEnabled).map(p => ({ name: p.name, hashrate: rateOf(minerProgress[p.name]) }));
  const race = busy ? {
    perMiner: minerProgress, attempts: miningProgress?.iterations ?? 0, elapsedMs: miningProgress?.elapsedMs ?? 0,
    targetSeconds, winner: raceWinner
  } : null;

  const selected = selectedIndex !== null && blocks[selectedIndex] ? selectedIndex : height;
  const block = blocks[selected];
  const selectedView = views[selected];
  const selectedBlock = block ? {
    index: selected, hash: block.hash, previousHash: block.previousHash, nonce: block.nonce, difficulty: block.difficulty,
    isNewest: selected === height && selected > 0, miner: selectedView?.isGenesis ? null : selectedView?.minerName,
    seconds: selectedView?.seconds, tries: lastRound?.index === selected ? lastRound.attempts : undefined,
    reward: block.transactions.find(tx => tx.sender === null)?.amount,
    transactions: block.transactions.map(tx => ({ from: nameOf(participants, tx.sender), to: nameOf(participants, tx.recipient),
      amount: tx.amount, reference: tx.referenceNumber }))
  } : null;
  const edits = tamperedEdits.filter(edit => edit.blockIndex === selected);

  // Miners first, then the other wallets in their creation order.
  const wallets = [...balances].sort((a, b) => Number(b.isMiner) - Number(a.isMiner)).map(wallet => {
    const participant = participants.find(p => p.publicKey === wallet.publicKey);
    return { name: wallet.name, balance: wallet.balance, isMiner: wallet.isMiner, blocksWon: participant?.blocksWon ?? 0,
      hashrate: wallet.isMiner ? rateOf(minerProgress[wallet.name]) : undefined };
  });
  const pending = memPool.map(tx => ({ from: nameOf(participants, tx.sender), to: nameOf(participants, tx.recipient),
    amount: tx.amount, reference: tx.referenceNumber }));
  const confirmed = blocks.slice(1).reverse().flatMap((b, i) => {
    const index = height - i;
    return b.transactions.map(tx => ({ blockIndex: index,
      label: tx.sender === null ? `Coinbase → ${nameOf(participants, tx.recipient)}` : `${nameOf(participants, tx.sender)} → ${nameOf(participants, tx.recipient)}`,
      amount: tx.amount }));
  }).slice(0, 12);
  const blockTimes = views.slice(1).reverse().filter(v => v.seconds !== null).map(v => ({ index: v.index, seconds: v.seconds })).slice(0, 8);
  const workbenchCoach = coach?.view === 'workbench' ? coach : null;
  const repairOrder = repair && !repair.undoOnly ? repair.order : [];

  return (
    <>
    {error && <div role="alert" className="wb-error">{error}</div>}
    <div className="wb-band">
      <ChainBand views={fresh ? views.slice(0, 1) : views} candidate={candidate} selectedIndex={selected} onSelect={onSelect}
        keyFigures={keyFigures} healthOpen={healthOpen || Boolean(repair)} onToggleHealth={onToggleHealth}
        coach={workbenchCoach} repairOrder={repairOrder} />
    </div>
    <div className="wb-timeline">
      <ChainTimeline views={views} candidate={candidate} selectedIndex={selected} onSelect={onSelect} onOpenChainLab={onOpenChainLab}
        keyFigures={keyFigures} healthOpen={healthOpen || Boolean(repair)} onToggleHealth={onToggleHealth}
        coach={workbenchCoach} repairOrder={repairOrder} />
    </div>
    <div className="wb-grid">
      <div className="wb-selected">
        <SelectedBlockCard block={selectedBlock} status={blockStatus[selected]} prevHash={blocks[selected - 1]?.hash ?? null}
          edit={edits.length ? edits : null} onOpenDetails={onOpenDetails} onOpenChainLab={onOpenChainLab}
          onTamper={onTamper} onUndo={onUndo} coach={workbenchCoach} />
      </div>
      <div className="wb-next">
        <NextBlockCard mode={mode} index={busy && remining !== null ? remining : nextIndex} txCount={memPool.length}
          reward={blockReward} difficulty={difficulty} onDifficulty={onDifficulty} autoMine={autoMine} onAutoMine={onAutoMine}
          onStartDemo={onStartDemo} onMine={onMine} onPause={onPause} onRemine={onRemine}
          repair={repair ? { ...repair, onUndo } : null} miners={miners} race={race} lastRound={lastRound}
          backedMiner={backedMiner} onBack={onBack} coach={workbenchCoach} />
      </div>
      <div className="wb-wallets">
        <WalletsCard wallets={wallets} coinName={coinName} onOpenWallet={onOpenWallet} onCreateWallet={onCreateWallet} />
      </div>
      <div className="wb-mempool">
        <MempoolCard transactions={pending} nextIndex={nextIndex} mining={busy} participants={participants.map(p => p.name)}
          coinName={coinName} reward={blockReward} onCreateTransaction={onCreateTransaction}
          newTxGlow={!busy && !repair && !fresh} coach={workbenchCoach} />
      </div>
      <div className="wb-activity">
        <ActivityCard confirmed={confirmed} blockTimes={blockTimes} targetSeconds={targetSeconds} />
      </div>
    </div>
    </>
  );
}

