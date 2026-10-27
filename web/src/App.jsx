import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlockchain } from './hooks/useBlockchain';
import { ParticipantsPanel } from './components/ParticipantsPanel';
import { BlockchainViewer } from './components/BlockchainViewer';
import { ControlPanel } from './components/ControlPanel';
import { MiningCard } from './components/MiningCard';
import { StatsDashboard } from './components/StatsDashboard';
import { BlockchainStatsPanel } from './components/BlockchainStatsPanel';
import { playMiningSuccessSound } from './lib/sound';
import { AnalyticsControl } from './components/AnalyticsControl';
import { telemetry } from './lib/telemetry';
import { HashLab } from './components/HashLab';
import { ChainLab } from './components/ChainLab';
import { LearningPath } from './components/LearningPath';
import { Modal } from './components/Modal';
import './index.css';

function BitcoinLogo({ size = 28, color = 'var(--sapBrandColor)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill={color} style={{ transition: 'fill var(--sapTransition)' }} />
      <path d="M22.5 14.1c.3-2-1.2-3-3.3-3.8l.7-2.7-1.6-.4-.6 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.6-1.6-.4-.7 2.7c-.3-.1-.7-.2-1-.3l-2.2-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 0 .1 0 .2.1-.1 0-.1 0-.2-.1l-1.1 4.5c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.8 2.1.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.4.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.8c2.8.5 5 .3 5.9-2.2.7-2-.1-3.2-1.5-4 1.1-.3 1.9-1 2.1-2.5zm-3.8 5.3c-.5 2-4 1-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.3c-.5 1.8-3.4.9-4.3.7l.8-3.3c1 .2 4 .7 3.5 2.6z" fill="white" />
    </svg>
  );
}

const INITIAL_CONFIG = {
  name: 'powCoin', miningDifficulty: 2, blockReward: 3.125, halvingEvent: 4,
  participants: ['Alice', 'Bob', 'Chris', 'Lars', 'Minas'], miners: ['Minas', 'Lars'], startingBalance: 0
};

function App() {
  const [theme, setTheme] = useState('light');
  const [muted, setMuted] = useState(true);
  const [winner, setWinner] = useState(null);
  const [autoMining, setAutoMining] = useState(false);
  const [coinName, setCoinName] = useState('powCoin');
  const [targetBlockTime, setTargetBlockTime] = useState(10);
  const [showStats, setShowStats] = useState(false);
  const [showHashLab, setShowHashLab] = useState(false);
  const [showChainLab, setShowChainLab] = useState(false);
  const [showLearning, setShowLearning] = useState(false);
  const [error, setError] = useState('');
  const lastAdjustedBlock = useRef(0);
  const simulation = useBlockchain(INITIAL_CONFIG);
  const { blockchain, balances, blocks, participants, memPool, chainValid,
    isMining, isSettingUp, difficulty, blockReward, halvingInterval,
    miningProgress, minerProgress, raceWinner, hashAttempts, selectedBlock,
    setSelectedBlock, createTransaction, mineBlock, setupInitialDistribution,
    generateRandomTransactions, setDifficulty, setHalvingInterval, tamperBlock,
    resetBlockchain, cancelMining, toggleMiner, setMinerHashpower } = simulation;
  const busy = isMining || isSettingUp;
  const fresh = blocks.length === 1 && memPool.length === 0;
  const tamperIndex = blocks.findIndex((b, i) => i > 0 && b.transactions.length > 0 && b.isValid());

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => {
    if (!winner) return;
    const timer = setTimeout(() => setWinner(null), 700);
    return () => clearTimeout(timer);
  }, [winner]);
  const showResult = useCallback(result => {
    if (result.success) {
      const name = result.winner || result.winners?.at(-1);
      setWinner(name);
      setError('');
      playMiningSuccessSound(!muted);
    } else if (!result.aborted) {
      setError(result.error || 'Mining could not finish. Reset the demo and try again.');
      setAutoMining(false);
    }
    return result;
  }, [muted]);
  const handleMine = useCallback(async () => showResult(await mineBlock()), [mineBlock, showResult]);
  const handleSetup = useCallback(async () => showResult(await setupInitialDistribution()), [setupInitialDistribution, showResult]);
  useEffect(() => {
    if (!autoMining || busy) return;
    const timer = setTimeout(async () => {
      if (fresh) await handleSetup();
      else { generateRandomTransactions(); await handleMine(); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [autoMining, busy, fresh, blocks.length, generateRandomTransactions, handleMine, handleSetup]);

  useEffect(() => {
    const height = blocks.length - 1;
    if (height < 10 || height % 10 !== 0 || lastAdjustedBlock.current === height) return;
    lastAdjustedBlock.current = height;
    const seconds = (blocks[height].timestamp - blocks[height - 10].timestamp) / 10000;
    if (seconds < targetBlockTime * 0.7 && difficulty < 5) setDifficulty(difficulty + 1);
    else if (seconds > targetBlockTime * 1.5 && difficulty > 1) setDifficulty(difficulty - 1);
  }, [blocks, difficulty, setDifficulty, targetBlockTime]);

  const reset = () => {
    setAutoMining(false);
    resetBlockchain();
    lastAdjustedBlock.current = 0;
    setWinner(null);
    setError('');
  };
  const stop = () => { setAutoMining(false); cancelMining(); };

  return (
    <div>
      <a className="skip-link" href="#simulator">Skip to simulator</a>
      <header className="app-header">
        <div className="app-brand">
          <BitcoinLogo size={32} />
          <div><h1>proofofwork.fyi</h1><p className="header-subtitle">The blockchain you can experiment with</p></div>
        </div>
        <div className="header-actions">
          <button className={autoMining || busy ? 'btn btn-negative' : 'btn btn-emphasized'} onClick={autoMining || busy ? stop : () => setAutoMining(true)}>
            {autoMining || busy ? 'Stop mining' : 'Auto-mine'}
          </button>
          <button className="btn btn-transparent" onClick={() => setShowStats(true)} aria-label="Open blockchain insights">{blocks.length - 1} mined</button>
          <button className="btn btn-transparent" onClick={reset}>Reset</button>
          <button className="btn btn-transparent" onClick={() => setShowLearning(true)}>Learning path</button>
          <button className="btn btn-transparent" aria-label="Open hash lab" onClick={() => setShowHashLab(true)}>Hash lab</button>
          <button className="btn btn-transparent" aria-label="Open chain lab" onClick={() => setShowChainLab(true)}>Chain lab</button>
          <button className="btn btn-transparent" onClick={() => { const value = theme === 'light' ? 'dark' : 'light'; setTheme(value); void telemetry.track('settings_changed', { setting: 'theme', value }); }} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>{theme === 'light' ? 'Dark' : 'Light'}</button>
          <button className="btn btn-transparent" onClick={() => { setMuted(!muted); void telemetry.track('settings_changed', { setting: 'sound', value: muted }); }} aria-pressed={!muted}>Sound {muted ? 'off' : 'on'}</button>
        </div>
      </header>

      <section className="simulation-intro" aria-labelledby="intro-title">
        <div>
          <h2 id="intro-title">Mine a block. See why it holds together.</h2>
          <p>Watch miners race to find a hash, send coins between wallets, then change a transaction to see the chain detect it.</p>
          <p className="simulation-note">A learning simulation in your browser. Coins have no monetary value. Refreshing or resetting starts over.</p>
        </div>
        <button className="btn btn-default" onClick={() => setShowLearning(true)}>Start guided experiments</button>
        {fresh && <button className="btn btn-emphasized" disabled={busy} onClick={handleSetup}>{busy ? 'Preparing demo…' : 'Start demo'}</button>}
        {!fresh && <a className="btn btn-default" href="#transaction-controls">Send a transaction</a>}
      </section>
      <details className="simulation-settings">
        <summary>Experiment settings <span>Difficulty {difficulty} · halving every {halvingInterval} blocks</span></summary>
        <div className="settings-fields">
          <label>Coin name<input aria-label="Coin name" value={coinName} maxLength={16} onChange={e => setCoinName(e.target.value)} /></label>
          <label>Mining difficulty<input aria-label="Mining difficulty" type="range" min="1" max="5" step="1" value={difficulty} disabled={busy} onChange={e => setDifficulty(e.target.value)} /><span>{difficulty} leading zeros</span></label>
          <label>Halving interval<input aria-label="Halving interval" type="number" min="2" max="100" value={halvingInterval} disabled={busy} onChange={e => setHalvingInterval(e.target.value)} /><span>blocks</span></label>
          <label>Target block time<input aria-label="Target block time" type="number" min="1" max="60" value={targetBlockTime} disabled={busy} onChange={e => { const value = Math.min(60, Math.max(1, Number(e.target.value) || 10)); if (value !== targetBlockTime) { setTargetBlockTime(value); void telemetry.track('settings_changed', { setting: 'target_block_time', value }); } }} /><span>seconds</span></label>
        </div>
        <p className="text-muted text-small">Higher difficulty takes longer. Difficulty adapts every 10 mined blocks. Halving reduces the reward for future blocks; it does not rewrite earlier rewards.</p>
      </details>
      <AnalyticsControl />
      {error && <div role="alert" className="simulation-error">{error}</div>}
      <main id="simulator" className="app-container">
        <section className="blockchain-column" aria-label="Blockchain experiment">
          <BlockchainViewer blocks={blocks} selectedBlock={selectedBlock} onSelectBlock={setSelectedBlock} chainValid={chainValid} participants={participants} coinName={coinName} onMine={handleMine} isMining={busy} />
        </section>
        <aside id="transaction-controls" className="controls-column">
          <ControlPanel key={participants[0].publicKey} participants={participants} memPool={memPool} isMining={busy} isSettingUp={isSettingUp} onCreateTransaction={createTransaction} onSetup={handleSetup} onGenerateRandom={generateRandomTransactions} onTamper={() => { if (tamperIndex > 0) tamperBlock(tamperIndex, 0, 999); }} coinName={coinName} blocks={blocks} tamperTargetIndex={tamperIndex} />
        </aside>
        <aside className="participants-column">
          <ParticipantsPanel balances={balances} participants={participants} blocks={blocks} coinName={coinName} toggleMiner={toggleMiner} setMinerHashpower={setMinerHashpower} isMining={busy} />
          <div className="mt-md" />
          <MiningCard key={participants[0].publicKey} isMining={isMining} miningProgress={miningProgress} minerProgress={minerProgress} raceWinner={raceWinner} difficulty={difficulty} hashAttempts={hashAttempts} />
          <StatsDashboard blocks={blocks} blockchain={blockchain} difficulty={difficulty} participants={participants} />
        </aside>
      </main>
      <footer className="app-footer"><p>proofofwork.fyi · Originally by Mirko Valentic, CS50 2021</p><p>This simplified model explores proof of work; it does not connect to Bitcoin.</p></footer>
      {winner && <div className="mining-announcement" role="status">{winner} mined a block</div>}
      <LearningPath open={showLearning} onClose={() => setShowLearning(false)} />
      {showHashLab && <Modal label="Hash lab" onClose={() => setShowHashLab(false)}><HashLab onClose={() => setShowHashLab(false)} /></Modal>}
      {showChainLab && <Modal label="Chain lab" onClose={() => setShowChainLab(false)}><ChainLab onClose={() => setShowChainLab(false)} /></Modal>}
      {showStats && <BlockchainStatsPanel blocks={blocks} participants={participants} difficulty={difficulty} blockReward={blockReward} halvingInterval={halvingInterval} onClose={() => setShowStats(false)} />}
    </div>
  );
}
export default App;
