import { TransactionForm } from './TransactionForm';
import { MiningVisualizer } from './MiningVisualizer';

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
    const getParticipantName = (publicKey) => {
        if (!publicKey) return 'Mining Reward';
        const participant = participants.find(p => p.publicKey === publicKey);
        return participant ? participant.name : 'Unknown';
    };

    // Show setup button only if blockchain is fresh (just genesis block) and mempool empty
    const showSetupButton = blocks.length === 1 && memPool.length === 0 && !isSettingUp;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Initial Setup Button (Contextual) */}
            {showSetupButton && (
                <div className="fiori-card animate-fade-in" style={{ borderColor: 'var(--sapPositiveColor)' }}>
                    <div className="fiori-card-content">
                        <button
                            className="btn btn-positive btn-lg"
                            style={{ width: '100%', marginBottom: '8px' }}
                            onClick={onSetup}
                            disabled={isMining || isSettingUp}
                        >
                            🚀 Setup Initial Distribution
                        </button>
                        <p className="text-muted text-small text-center">
                            Automatically mines reward, sends 0.6 {coinName} to each participant, and mines a second block.
                        </p>
                    </div>
                </div>
            )}

            {isSettingUp && (
                <div className="fiori-card animate-pulse">
                    <div className="fiori-card-content text-center">
                        <p className="text-brand font-bold">
                            🚀 Setting up initial coin distribution...
                        </p>
                    </div>
                </div>
            )}

            {/* Transaction Form */}
            <div className="fiori-card">
                <div className="fiori-card-header">
                    <h3>📝 New Transaction</h3>
                </div>
                <div className="fiori-card-content">
                    <TransactionForm
                        participants={participants}
                        onCreateTransaction={onCreateTransaction}
                        disabled={isMining}
                        coinName={coinName}
                    />
                </div>
            </div>

            {/* Mempool */}
            <div className="fiori-card">
                <div className="fiori-card-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📋 Mempool
                        {memPool.length > 0 && (
                            <span className="mempool-count">{memPool.length}</span>
                        )}
                    </h3>
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
                            <div key={index} className="tx-item">
                                <div className="tx-header">
                                    <span className="tx-parties text-small">
                                        {getParticipantName(tx.sender)} → {getParticipantName(tx.recipient)}
                                    </span>
                                    <span className="tx-amount">{tx.amount} {coinName}</span>
                                </div>
                                {tx.referenceNumber && (
                                    <div className="tx-reference">{tx.referenceNumber}</div>
                                )}
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
                            className="btn btn-negative"
                            onClick={onTamper}
                            disabled={isMining}
                            title="Modify a transaction to demonstrate chain invalidation"
                        >
                            💥 Tamper with Block #{tamperTargetIndex}
                        </button>
                    </div>

                    <p className="text-muted text-small mt-md">
                        Try tampering to see how the chain becomes invalid!
                    </p>
                </div>
            </div>
        </div>
    );
}
