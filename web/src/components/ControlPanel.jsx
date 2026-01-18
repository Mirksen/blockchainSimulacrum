import { TransactionForm } from './TransactionForm';
import { MiningVisualizer } from './MiningVisualizer';

export function ControlPanel({
    participants,
    memPool,
    difficulty,
    isMining,
    miningProgress,
    chainValid,
    onCreateTransaction,
    onMine,
    onSetDifficulty,
    onTamper,
    onReset
}) {
    const getParticipantName = (publicKey) => {
        if (!publicKey) return 'Mining Reward';
        const participant = participants.find(p => p.publicKey === publicKey);
        return participant ? participant.name : 'Unknown';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            {/* Transaction Form */}
            <div className="glass-card">
                <div className="glass-card-header">
                    <h3>📝 New Transaction</h3>
                </div>
                <TransactionForm
                    participants={participants}
                    onCreateTransaction={onCreateTransaction}
                    disabled={isMining}
                />
            </div>

            {/* Mempool */}
            <div className="glass-card">
                <div className="glass-card-header">
                    <h3>📋 Mempool</h3>
                    {memPool.length > 0 && (
                        <span className="mempool-count">{memPool.length}</span>
                    )}
                </div>

                {memPool.length === 0 ? (
                    <div className="mempool-empty">
                        No pending transactions
                    </div>
                ) : (
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {memPool.map((tx, index) => (
                            <div key={index} className="tx-item">
                                <div className="tx-header">
                                    <span className="tx-parties text-xs">
                                        {getParticipantName(tx.sender)} → {getParticipantName(tx.recipient)}
                                    </span>
                                    <span className="tx-amount text-sm">{tx.amount} LKC</span>
                                </div>
                                {tx.referenceNumber && (
                                    <div className="tx-reference">{tx.referenceNumber}</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Mining Controls */}
            <div className="glass-card">
                <div className="glass-card-header">
                    <h3>⛏️ Mining</h3>
                </div>

                <div className="slider-container">
                    <label className="form-label">
                        Difficulty: <span className="text-bitcoin font-bold">{difficulty}</span> leading zeros
                    </label>
                    <input
                        type="range"
                        className="slider"
                        min="1"
                        max="5"
                        value={difficulty}
                        onChange={(e) => onSetDifficulty(e.target.value)}
                        disabled={isMining}
                    />
                    <div className="slider-labels">
                        <span>Easy (1)</span>
                        <span>Hard (5)</span>
                    </div>
                </div>

                <p className="text-muted text-xs mb-md">
                    Higher difficulty = more zeros required = exponentially more time to mine
                </p>

                <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                    onClick={onMine}
                    disabled={isMining || memPool.length === 0}
                >
                    {isMining ? (
                        <>
                            <span className="animate-spin">⚙️</span>
                            Mining...
                        </>
                    ) : (
                        <>⛏️ Mine Next Block</>
                    )}
                </button>

                {memPool.length === 0 && !isMining && (
                    <p className="text-muted text-xs mt-sm" style={{ textAlign: 'center' }}>
                        Add transactions to the mempool first
                    </p>
                )}

                <MiningVisualizer
                    isMining={isMining}
                    progress={miningProgress}
                    difficulty={difficulty}
                />
            </div>

            {/* Demo Controls */}
            <div className="glass-card">
                <div className="glass-card-header">
                    <h3>🧪 Demo Tools</h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    <button
                        className="btn btn-danger"
                        onClick={onTamper}
                        disabled={isMining}
                        title="Modify a transaction to demonstrate chain invalidation"
                    >
                        💥 Tamper with Block #1
                    </button>

                    <button
                        className="btn btn-secondary"
                        onClick={onReset}
                        disabled={isMining}
                    >
                        🔄 Reset Blockchain
                    </button>
                </div>

                <p className="text-muted text-xs mt-md">
                    Try tampering to see how the chain becomes invalid!
                </p>
            </div>
        </div>
    );
}
