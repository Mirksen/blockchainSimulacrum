import { useMemo } from 'react';
import { ChainBand } from './ChainBand';
import { ChainTimeline } from './ChainTimeline';
import { SelectedBlockCard } from './SelectedBlockCard';
import { NextBlockCard } from './NextBlockCard';
import { MinerName } from './MinerName';
import { WalletsCard } from './WalletsCard';
import { MempoolCard } from './MempoolCard';
import { ActivityCard } from './ActivityCard';
import { BlockTransactions } from './BlockTransactions';
import { buildBlockViews } from './blockView';
import { keyFiguresOf, rateOf, repairOf } from './workbenchModel';
import './Workbench.css';

// The workbench view (web/DESIGN.md, "Information architecture"): chain band and
// card grid; App frames it with the mission rail. It turns the simulation snapshot
// into the view models of the presentational components; App owns state and effects.

const satoshis = coins => Math.round(coins * 1e8);
// A signed coinbase names its miner in the memo and commits to it in a last output.
const signerOf = coinbase => (coinbase.outputs.some(output => output.kind === 'commitment') ? coinbase.memo : null);

export function Workbench({
  sim, coinName, targetSeconds, autoMine, onAutoMine, autoTransact, onAutoTransact, selectedIndex, onSelect, onFollowNewest, healthOpen, onToggleHealth,
  lastRound, remining, coach, identity, boardRows,
  onStartDemo, onMine, onPause, onRemine, onTamper, onUndo, onDifficulty, onBack,
  onCreateTransaction, onCreateWallet, onOpenWallet, onOpenDetails, onOpenTransaction, onOpenBlockTx, onOpenChainLab, error
}) {
  const { blocks, blockStatus, participants, memPool, balances, tamperedEdits, describeTx, previewTransaction, difficulty, blockReward, halvingInterval,
    isMining, isSettingUp, minerProgress, miningProgress, raceWinner, backedMiner } = sim;
  const busy = isMining || isSettingUp;
  const height = blocks.length - 1;
  const fresh = height === 0 && memPool.length === 0 && !busy;
  const views = useMemo(() => buildBlockViews({ blocks, blockStatus, participants, tamperedEdits }),
    [blocks, blockStatus, participants, tamperedEdits]);
  const repair = repairOf(blockStatus, tamperedEdits);
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

  const pinned = selectedIndex !== null && Boolean(blocks[selectedIndex]);
  const selected = pinned ? selectedIndex : height;
  const block = blocks[selected];
  const selectedView = views[selected];
  const selectedBlock = block ? {
    index: selected, hash: block.hash, previousHash: block.previousHash, txRoot: block.txRoot, anchor: selectedView?.anchor ?? null, nonce: block.nonce, difficulty: block.difficulty,
    isNewest: selected === height && selected > 0, miner: selectedView?.isGenesis ? null : selectedView?.minerName,
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
    return { name: wallet.name, balance: wallet.balance, isMiner: wallet.isMiner, blocksWon: participant?.blocksWon ?? 0,
      hashrate: wallet.isMiner ? rateOf(minerProgress[wallet.name]) : undefined };
  });
  const pending = memPool.map(tx => {
    const view = describeTx(tx);
    return { id: view.txid, tx, from: view.from, to: view.to, amount: view.amount, reference: view.memo, inputs: view.inputs.length,
      change: view.change, fee: view.fee };
  });
  const pendingFees = pending.reduce((sum, tx) => sum + satoshis(tx.fee ?? 0), 0) / 1e8;
  const confirmed = blocks.slice(1).reverse().flatMap((b, i) => {
    const index = height - i;
    return b.transactions.map(tx => {
      const view = describeTx(tx);
      return { blockIndex: index, label: `${view.coinbase ? 'Coinbase' : view.from} → ${view.to}`, amount: view.amount };
    });
  }).slice(0, 12);
  const blockTimes = views.slice(1).reverse().filter(v => v.seconds !== null).map(v => ({ index: v.index, seconds: v.seconds })).slice(0, 8);
  const workbenchCoach = coach?.view === 'workbench' ? coach : null;
  const selectedTransactions = selectedBlock ? (blocks[selected]?.transactions ?? []).map(describeTx) : [];
  const repairOrder = repair && !repair.undoOnly ? repair.order : [];

  return (
    <>
    {error && <div role="alert" className="wb-error">{error}</div>}
    <div className="wb-band">
      <ChainBand views={fresh ? views.slice(0, 1) : views} candidate={candidate} selectedIndex={selected} pinned={pinned} onSelect={onSelect}
        keyFigures={keyFigures} healthOpen={healthOpen || Boolean(repair)} onToggleHealth={onToggleHealth}
        coach={workbenchCoach} repairOrder={repairOrder} />
    </div>
    <div className="wb-timeline">
      <ChainTimeline views={views} candidate={candidate} selectedIndex={selected} pinned={pinned} onSelect={onSelect} onOpenChainLab={onOpenChainLab}
        keyFigures={keyFigures} healthOpen={healthOpen || Boolean(repair)} onToggleHealth={onToggleHealth}
        coach={workbenchCoach} repairOrder={repairOrder} />
    </div>
    <div className="wb-grid">
      <div className="wb-selected">
        <SelectedBlockCard block={selectedBlock} status={blockStatus[selected]} prevHash={blocks[selected - 1]?.hash ?? null}
          edit={edits.length ? edits : null} onOpenDetails={onOpenDetails} onOpenChainLab={onOpenChainLab}
          pinned={pinned} onFollowNewest={onFollowNewest} onTamper={onTamper} onUndo={onUndo} coach={workbenchCoach}>
          <BlockTransactions key={`transactions-${selected}`} transactions={selectedTransactions} editedTx={edits.map(edit => edit.txIndex)}
            onOpenDetails={tx => onOpenBlockTx?.(tx, selected)} />
        </SelectedBlockCard>
      </div>
      <div className="wb-next">
        <NextBlockCard mode={mode} index={busy && remining !== null ? remining : nextIndex} txCount={memPool.length}
          reward={blockReward} difficulty={difficulty} onDifficulty={onDifficulty} autoMine={autoMine} onAutoMine={onAutoMine}
          onStartDemo={onStartDemo} onMine={onMine} onPause={onPause} onRemine={onRemine}
          repair={repair ? { ...repair, onUndo } : null} miners={miners} race={race} lastRound={lastRound}
          backedMiner={backedMiner} onBack={onBack} coach={workbenchCoach}
          signature={<MinerName identity={identity} rows={boardRows} locked={busy} />} />
      </div>
      <div className="wb-wallets">
        <WalletsCard wallets={wallets} coinName={coinName} onOpenWallet={onOpenWallet} onCreateWallet={onCreateWallet} />
      </div>
      <div className="wb-mempool">
        <MempoolCard transactions={pending} nextIndex={nextIndex} mining={busy} participants={participants.map(p => p.name)}
          coinName={coinName} reward={blockReward + pendingFees} onCreateTransaction={onCreateTransaction}
          onPreviewTransaction={previewTransaction} onOpenTransaction={onOpenTransaction}
          autoTransact={autoTransact} onAutoTransact={onAutoTransact}
          newTxGlow={!busy && !repair && !fresh} coach={workbenchCoach} />
      </div>
      <div className="wb-activity">
        <ActivityCard confirmed={confirmed} blockTimes={blockTimes} targetSeconds={targetSeconds} />
      </div>
    </div>
    </>
  );
}

