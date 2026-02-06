import { TransactionForm } from './TransactionForm';
import { MiningVisualizer } from './MiningVisualizer';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { useState, useRef, useEffect } from 'react';

export function ControlPanel({
    participants,
    memPool,
    difficulty,
    isMining,
    isSettingUp,
    miningProgress,
    hashAttempts,
    chainValid,
    onCreateTransaction,
    onMine,
    onMineEmpty,
    onSetup,
    onSetDifficulty,
    onTamper,
    onReset,
    onGenerateRandom,
    coinName = 'powCoin',
    blocks = [],
    tamperTargetIndex = 1
}) {
    const [newTxIndices, setNewTxIndices] = useState(new Set());
    const [mempoolHighlight, setMempoolHighlight] = useState(false);
    const [selectedTx, setSelectedTx] = useState(null);
    const prevMempoolLengthRef = useRef(memPool.length);

    // Track new transactions entering mempool
    useEffect(() => {
        const prevLength = prevMempoolLengthRef.current;
        const currentLength = memPool.length;

        if (currentLength > prevLength) {
            // New transactions added - mark them as new
            const newIndices = new Set();
            for (let i = prevLength; i < currentLength; i++) {
                newIndices.add(i);
            }
            setNewTxIndices(newIndices);
            setMempoolHighlight(true);

            // Clear animation after it completes
            setTimeout(() => {
                setNewTxIndices(new Set());
                setMempoolHighlight(false);
            }, 1200);
        }

        prevMempoolLengthRef.current = currentLength;
    }, [memPool.length]);

    const getParticipantName = (publicKey) => {
        if (!publicKey) return 'Mining Reward';
        const participant = participants.find(p => p.publicKey === publicKey);
        return participant ? participant.name : 'Unknown';
    };

    // Show setup button only if blockchain is fresh (just genesis block) and mempool empty
    const showSetup = blocks.length === 1 && memPool.length === 0;

    return (
        <div className="animate-fadeIn">
            {/* Setup Button - only show when blockchain is fresh */}
            {showSetup && (
                <div className="fiori-card" style={{ marginBottom: '16px' }}>
                    <div className="fiori-card-content" style={{ textAlign: 'center' }}>
                        <p style={{ marginBottom: '12px', color: 'var(--sapContent_LabelColor)' }}>
                            Start with a demo distribution? The first miner will send 0.6 coins to each participant.
                        </p>
                        <button
                            className="btn btn-emphasized"
                            onClick={onSetup}
                            disabled={isMining || isSettingUp}
                            style={{ width: '100%' }}
                        >
                            🚀 Setup Initial Distribution
                        </button>
                    </div>
                </div>
            )}

            {/* New Transaction Card */}
            <div className="fiori-card">
                <div className="fiori-card-header">
                    <h3>💸 New Transaction</h3>
                </div>
                <div className="fiori-card-content">
                    <TransactionForm
                        participants={participants}
                        onCreateTransaction={onCreateTransaction}
                        disabled={isMining || participants.length < 2}
                        coinName={coinName}
                    />
                </div>
            </div>

            <div className="mt-md"></div>

            {/* Mempool */}
            <div className={`fiori-card ${mempoolHighlight ? 'mempool-card-highlight' : ''}`}>
                <div className="fiori-card-header">
                    <h3>📋 Mempool</h3>
                    <span className={`badge ${mempoolHighlight ? 'mempool-badge-pulse' : ''}`}>
                        {memPool.length} pending
                    </span>
                    <button
                        className="btn btn-transparent"
                        onClick={onGenerateRandom}
                        disabled={isMining || participants.length < 2}
                        title="Fill mempool with random transactions"
                        style={{ padding: '4px 8px' }}
                    >
                        🔀
                    </button>
                </div>

                {memPool.length === 0 ? (
                    <div className="mempool-empty">
                        No pending transactions
                    </div>
                ) : (
                    <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                        {memPool.map((tx, index) => (
                            <div
                                key={index}
                                className={`tx-item clickable-tx ${newTxIndices.has(index) ? 'mempool-tx-new' : ''}`}
                                onClick={() => setSelectedTx(tx)}
                            >
                                <div className="tx-header">
                                    <span className="tx-parties text-small">
                                        {getParticipantName(tx.sender)} → {getParticipantName(tx.recipient)}
                                    </span>
                                    <span className="tx-amount">{tx.amount} {coinName}</span>
                                </div>
                                {tx.referenceNumber && (
                                    <div className="tx-reference">{tx.referenceNumber}</div>
                                )}
                                <div className="mempool-tx-hint">👆 Click for details</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>



            {/* Demo Controls */}
            <div className="fiori-card">
                <div className="fiori-card-header">
                    <h3>🧪 Demo Tools</h3>
                </div>
                <div className="fiori-card-content">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                            className="btn"
                            onClick={() => onTamper(1)}
                            disabled={isMining || blocks.length <= 1}
                            title="Change data in a block to show how the hash changes"
                        >
                            🔧 Tamper Block #{tamperTargetIndex}
                        </button>
                    </div>
                </div>
            </div>

            {/* Transaction Details Modal for mempool items */}
            {selectedTx && (
                <TransactionDetailsModal
                    transaction={selectedTx}
                    blockIndex="Pending"
                    participants={participants}
                    onClose={() => setSelectedTx(null)}
                />
            )}
        </div>
    );
}
