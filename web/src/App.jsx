import { useEffect, useRef, useState } from 'react';
import { useBlockchain } from './hooks/useBlockchain';
import { ParticipantsPanel } from './components/ParticipantsPanel';
import { BlockchainViewer } from './components/BlockchainViewer';
import { ControlPanel } from './components/ControlPanel';
import { MiningCard } from './components/MiningCard';
import { StatsDashboard } from './components/StatsDashboard';
import { playMiningSuccessSound } from './lib/sound';
import './index.css';

// SAP Fiori-style Bitcoin Logo component
// SAP Fiori-style Bitcoin Logo component
function BitcoinLogo({ size = 28, color = 'var(--sapBrandColor)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill={color} style={{ transition: 'fill var(--sapTransition)' }} />
      <path d="M22.5 14.1c.3-2-1.2-3-3.3-3.8l.7-2.7-1.6-.4-.6 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.6-1.6-.4-.7 2.7c-.3-.1-.7-.2-1-.3l-2.2-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.2c0 0 .1 0 .2.1-.1 0-.1 0-.2-.1l-1.1 4.5c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.8 2.1.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.4.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.8c2.8.5 5 .3 5.9-2.2.7-2-.1-3.2-1.5-4 1.1-.3 1.9-1 2.1-2.5zm-3.8 5.3c-.5 2-4 1-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.3c-.5 1.8-3.4.9-4.3.7l.8-3.3c1 .2 4 .7 3.5 2.6z" fill="white" />
    </svg>
  );
}

// Theme Toggle Component
function ThemeToggle({ theme, onToggle }) {
  return (
    <div className="theme-toggle">
      <label
        className={`theme-toggle-label ${theme === 'dark' ? 'active' : ''}`}
        onClick={() => onToggle('dark')}
      >
        <input type="radio" name="theme" value="dark" checked={theme === 'dark'} readOnly />
        🌙 Dark
      </label>
      <label
        className={`theme-toggle-label ${theme === 'light' ? 'active' : ''}`}
        onClick={() => onToggle('light')}
      >
        <input type="radio" name="theme" value="light" checked={theme === 'light'} readOnly />
        ☀️ Light
      </label>
    </div>
  );
}

function App() {
  // Theme state
  const [theme, setTheme] = useState('light');
  // Sound & Animation state
  // Sound & Animation state
  const [isMuted, setIsMuted] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [isAutoMining, setIsAutoMining] = useState(false);
  const [appName, setAppName] = useState('powCoin');
  const [tamperIndex, setTamperIndex] = useState(1);
  const [halvingInterval, setHalvingInterval] = useState(5);
  const [targetBlockTime, setTargetBlockTime] = useState(10);
  const adjustmentPeriod = 10; // Difficulty adjusts every 10 blocks

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const {
    blockchain,
    balances,
    isMining,
    isSettingUp,
    miningProgress,
    hashAttempts,
    selectedBlock,
    chainValid,
    memPool,
    blocks,
    participants,
    difficulty,
    setSelectedBlock,
    createTransaction,
    mineBlock,
    mineEmptyBlock,
    setupInitialDistribution,
    generateRandomTransactions,
    setDifficulty,
    tamperBlock,
    resetBlockchain,
    cancelMining
  } = useBlockchain({
    name: 'powCoin',
    miningDifficulty: 3,
    blockReward: 3.125,
    halvingEvent: halvingInterval,
    participants: ['Alice', 'Bob', 'Bill', 'Chris', 'Minas'],
    miner: 'Minas',
    startingBalance: 0
  });

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
  }, []);

  const handleTamper = () => {
    // Attempt to tamper with the target block
    // Ensures we don't crash if block doesn't exist or has no transactions
    if (blocks.length > tamperIndex) {
      if (blocks[tamperIndex].transactions.length > 0) {
        tamperBlock(tamperIndex, 0, 999);
      } else {
        // If empty block, we can't tamper transaction.
        // TODO: Implement nonce tampering? For now just skip.
        console.warn("Cannot tamper empty block (no transactions)");
      }
      setTamperIndex(prev => prev + 1);
    }
  };

  const handleReset = () => {
    resetBlockchain();
    setTamperIndex(1);
    setIsAutoMining(false);
    cancelMining();
  };

  const handleMine = async () => {
    const result = await mineBlock();
    if (result && result.success) {
      playMiningSuccessSound(!isMuted);
      setShowAnimation(true);
      setTimeout(() => setShowAnimation(false), 1500);
    }
  };

  // Auto-Mine Loop
  useEffect(() => {
    if (!isAutoMining) return;
    if (isMining) return;
    if (isSettingUp) return;

    // Auto-trigger setup if chain is fresh (Genesis only)
    if (blocks.length === 1 && memPool.length === 0) {
      setupInitialDistribution();
      return;
    }

    const timer = setTimeout(() => {
      // 1. Propagate Mempool (Generate Transactions)
      generateRandomTransactions();

      // 2. Mine Block (triggers animation/sound via handleMine)
      handleMine();
    }, 2000); // 2 second delay between blocks

    return () => clearTimeout(timer);
  }, [isAutoMining, isMining, isSettingUp, blocks.length, memPool.length, generateRandomTransactions, handleMine, setupInitialDistribution]);

  // Automatic Difficulty Adjustment
  const lastAdjustedBlock = useRef(0);

  useEffect(() => {
    // Only adjust at adjustment period boundaries (every 10 blocks) 
    const currentBlock = blocks.length - 1;

    // Need at least adjustmentPeriod blocks before first adjustment
    if (currentBlock < adjustmentPeriod) return;

    // Only adjust at blocks 10, 20, 30, etc.
    if (currentBlock % adjustmentPeriod !== 0) return;

    // Prevent adjusting the same block multiple times
    if (lastAdjustedBlock.current === currentBlock) return;
    lastAdjustedBlock.current = currentBlock;

    // Calculate average block time for the last adjustment period
    let totalTime = 0;
    for (let i = currentBlock - adjustmentPeriod + 1; i <= currentBlock; i++) {
      const blockTime = (blocks[i].timestamp - blocks[i - 1].timestamp) / 1000;
      totalTime += blockTime;
    }

    const avgBlockTime = totalTime / adjustmentPeriod;
    const ratio = avgBlockTime / targetBlockTime;

    console.log(`📊 Adjustment check at block ${currentBlock}: avg=${avgBlockTime.toFixed(1)}s, target=${targetBlockTime}s, ratio=${ratio.toFixed(2)}`);

    // Adjust difficulty based on ratio
    if (ratio < 0.7 && difficulty < 5) {
      // Blocks are faster than 70% of target -> increase difficulty
      const newDiff = difficulty + 1;
      console.log(`⬆️ Difficulty: ${difficulty} → ${newDiff}`);
      setDifficulty(newDiff);
    } else if (ratio > 1.5 && difficulty > 1) {
      // Blocks are slower than 150% of target -> decrease difficulty
      const newDiff = difficulty - 1;
      console.log(`⬇️ Difficulty: ${difficulty} → ${newDiff}`);
      setDifficulty(newDiff);
    } else {
      console.log(`➡️ Difficulty unchanged at ${difficulty}`);
    }
  }, [blocks.length]); // Only trigger on block count change

  return (
    <div>
      {/* SAP Fiori Shell Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BitcoinLogo size={28} />
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px dashed var(--sapContent_LabelColor)',
                  color: 'inherit',
                  fontSize: 'inherit',
                  fontFamily: 'inherit',
                  fontWeight: 'inherit',
                  width: '140px',
                  padding: '0 2px'
                }}
              />
              simulacrum
            </h1>
            <p className="header-subtitle">
              Bitcoin Proof of Work Demonstration
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Auto-Mine Toggle */}
          {/* Auto-Mine Toggle */}
          <button
            className={isAutoMining ? "btn btn-positive" : "btn btn-transparent"}
            onClick={() => {
              if (isAutoMining) {
                setIsAutoMining(false);
                cancelMining();
              } else {
                setIsAutoMining(true);
              }
            }}
            title={isAutoMining ? "Stop Auto-Mining" : "Start Auto-Mining Loop"}
            style={{ marginRight: '8px', fontWeight: 'bold' }}
          >
            {isAutoMining ? '⏹ Stop' : '▶ Auto-Mine'}
          </button>

          {/* Reset Button */}
          <button
            className="btn btn-transparent"
            onClick={handleReset}
            disabled={isMining && !isAutoMining}
            title="Reset Blockchain"
            style={{ marginRight: '16px', fontSize: '18px', padding: '4px' }}
          >
            🔄
          </button>

          {/* Difficulty Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px', paddingRight: '12px', borderRight: '1px solid var(--sapGroup_TitleBorderColor)' }}>
            <span style={{ fontSize: '13px', color: 'var(--sapContent_LabelColor)' }}>Difficulty:</span>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={isMining}
              style={{ width: '60px', cursor: 'pointer' }}
              title="Adjust Mining Difficulty (Leading Zeros)"
            />
            <span style={{ fontSize: '13px', fontWeight: 'bold', width: '10px' }}>{difficulty}</span>
          </div>

          {/* Target Block Time */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px', paddingRight: '12px', borderRight: '1px solid var(--sapGroup_TitleBorderColor)', cursor: 'help' }}
            title={`Difficulty adjusts every ${adjustmentPeriod} blocks based on actual vs target block time`}
          >
            <span style={{ fontSize: '13px', color: 'var(--sapContent_LabelColor)' }}>Target:</span>
            <input
              type="number"
              min="1"
              max="60"
              value={targetBlockTime}
              onChange={(e) => setTargetBlockTime(Math.max(1, parseInt(e.target.value) || 10))}
              disabled={isMining}
              style={{ width: '45px', padding: '4px', borderRadius: '4px', border: '1px solid var(--sapField_BorderColor)', textAlign: 'center' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--sapContent_LabelColor)' }}>s</span>
          </div>

          {/* Halving Interval */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px', paddingRight: '12px', borderRight: '1px solid var(--sapGroup_TitleBorderColor)' }}>
            <span style={{ fontSize: '13px', color: 'var(--sapContent_LabelColor)' }}>Halving:</span>
            <input
              type="number"
              min="2"
              max="100"
              value={halvingInterval}
              onChange={(e) => setHalvingInterval(Math.max(2, parseInt(e.target.value) || 5))}
              disabled={isMining}
              style={{ width: '50px', padding: '4px', borderRadius: '4px', border: '1px solid var(--sapField_BorderColor)', textAlign: 'center' }}
              title="Blocks between halving events"
            />
          </div>

          <div className={`validation-status ${chainValid ? 'validation-valid' : 'validation-invalid'}`}>
            {chainValid ? '✓ Valid' : '⚠️ Invalid'}
          </div>
          <div style={{ color: 'var(--sapShell_SubtitleColor)', fontSize: '13px' }}>
            <span style={{ fontFamily: 'var(--sapFontMonoFamily)' }}>{blocks.length}</span> blocks
          </div>
          <ThemeToggle theme={theme} onToggle={setTheme} />

          <button
            className="btn btn-transparent"
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? "Unmute Sound Effects" : "Mute Sound Effects"}
            style={{ fontSize: '18px', padding: '4px', cursor: 'pointer', border: 'none', background: 'transparent' }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-container">
        {/* Left Panel - Participants */}
        <aside>
          <ParticipantsPanel
            balances={balances}
            participants={participants}
            coinName={appName}
          />
          <div className="mt-md"></div>
          <MiningCard
            isMining={isMining}
            miningProgress={miningProgress}
            difficulty={difficulty}
            hashAttempts={hashAttempts}
          />
          <StatsDashboard
            blocks={blocks}
            blockchain={blockchain}
            difficulty={difficulty}
          />
        </aside>

        {/* Center - Blockchain */}
        <section>
          <BlockchainViewer
            blocks={blocks}
            selectedBlock={selectedBlock}
            onSelectBlock={setSelectedBlock}
            chainValid={chainValid}
            participants={participants}
            coinName={appName}
            onMine={handleMine}
            isMining={isMining}
          />
        </section>

        {/* Right Panel - Controls */}
        <aside>
          <ControlPanel
            participants={participants}
            memPool={memPool}
            difficulty={difficulty}
            isMining={isMining}
            isSettingUp={isSettingUp}
            miningProgress={miningProgress}
            hashAttempts={hashAttempts}
            chainValid={chainValid}
            onCreateTransaction={createTransaction}
            onMine={handleMine}
            onMineEmpty={mineEmptyBlock}
            onSetup={setupInitialDistribution}
            onGenerateRandom={generateRandomTransactions}
            onTamper={handleTamper}
            onReset={handleReset}
            coinName={appName}
            blocks={blocks}
            tamperTargetIndex={tamperIndex}
          />
        </aside>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Blockchain Simulacrum • Originally by Mirko Valentic (CS50 2021) • SAP Fiori Redesign 2026
        </p>
        <p style={{ marginTop: '4px' }}>
          Educational demonstration of Bitcoin's Proof of Work consensus mechanism
        </p>
      </footer>
      {showAnimation && (
        <div className="mining-overlay">
          <div className="mining-overlay-icon">🔨</div>
        </div>
      )}
    </div>
  );
}

export default App;
