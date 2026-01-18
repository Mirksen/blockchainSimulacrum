import { useBlockchain } from './hooks/useBlockchain';
import { ParticipantsPanel } from './components/ParticipantsPanel';
import { BlockchainViewer } from './components/BlockchainViewer';
import { ControlPanel } from './components/ControlPanel';
import './index.css';

function App() {
  const {
    blockchain,
    balances,
    isMining,
    miningProgress,
    selectedBlock,
    chainValid,
    memPool,
    blocks,
    participants,
    difficulty,
    setSelectedBlock,
    createTransaction,
    mineBlock,
    setDifficulty,
    tamperBlock,
    resetBlockchain
  } = useBlockchain({
    name: 'Lukacoin',
    miningDifficulty: 3,
    blockReward: 3.125,
    halvingEvent: 2,
    participants: ['Mirksen', 'Kate', 'Bill', 'Chris', 'Minas'],
    miner: 'Minas'
  });

  const handleTamper = () => {
    if (blocks.length > 1 && blocks[1].transactions.length > 0) {
      tamperBlock(1, 0, 999);
    }
  };

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.5rem' }}>🔗</span>
          <div>
            <h1 className="text-gradient" style={{ fontSize: '1.25rem', marginBottom: '2px' }}>
              {blockchain.name} Simulator
            </h1>
            <p className="text-muted text-xs">
              Bitcoin Proof of Work Demonstration
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className={`validation-status ${chainValid ? 'validation-valid' : 'validation-invalid'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            {chainValid ? '✓ Chain Valid' : '⚠️ Chain Corrupted'}
          </div>
          <div className="text-muted text-sm">
            <span className="font-mono">{blocks.length}</span> blocks
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-container">
        {/* Left Panel - Participants */}
        <aside>
          <ParticipantsPanel
            balances={balances}
            participants={participants}
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
          />
        </section>

        {/* Right Panel - Controls */}
        <aside>
          <ControlPanel
            participants={participants}
            memPool={memPool}
            difficulty={difficulty}
            isMining={isMining}
            miningProgress={miningProgress}
            chainValid={chainValid}
            onCreateTransaction={createTransaction}
            onMine={mineBlock}
            onSetDifficulty={setDifficulty}
            onTamper={handleTamper}
            onReset={resetBlockchain}
          />
        </aside>
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: 'var(--space-lg)',
        color: 'var(--color-text-muted)',
        fontSize: '0.75rem'
      }}>
        <p>
          Blockchain Simulacrum • Originally by Mirko Valentic (CS50 2021) • Modern UI Rewrite 2026
        </p>
        <p style={{ marginTop: '4px' }}>
          Educational demonstration of Bitcoin's Proof of Work consensus mechanism
        </p>
      </footer>
    </div>
  );
}

export default App;
