import { TransactionForm } from './TransactionForm';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { useState } from 'react';

export function ControlPanel({
    participants,
    memPool,
    isMining,
    onCreateTransaction,
    onTamper,
    onGenerateRandom,
    coinName = 'powCoin',
    tamperTargetIndex = 1
}) {
    const [selectedTx, setSelectedTx] = useState(null);

    const getParticipantName = (publicKey) => {
        if (!publicKey) return 'Mining Reward';
        const participant = participants.find(p => p.publicKey === publicKey);
        return participant ? participant.name : 'Unknown';
    };

    return (
        <div className="animate-fadeIn">
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
            <div className="fiori-card">
                <div className="fiori-card-header">
                    <h3>📋 Mempool</h3>
                    <span className="badge">
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
                                className="tx-item clickable-tx"
                                onClick={() => setSelectedTx(tx)} role="button" tabIndex={0} aria-label={`Pending transfer from ${getParticipantName(tx.sender)} to ${getParticipantName(tx.recipient)}: ${tx.amount}`} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.currentTarget.click(); } }}
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
                            disabled={isMining || tamperTargetIndex < 1}
                            title="Change data in a block to show how the hash changes"
                        >
                            {tamperTargetIndex > 0 ? `Tamper with block #${tamperTargetIndex}` : 'Mine a block to try tampering'}
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
