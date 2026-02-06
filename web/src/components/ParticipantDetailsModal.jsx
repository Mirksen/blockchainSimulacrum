import { useState } from 'react';
import { TransactionDetailsModal } from './TransactionDetailsModal';

export function ParticipantDetailsModal({
    participant,
    balance,
    blocks,
    onClose,
    toggleMiner,
    setMinerHashpower,
    isMining,
    coinName = 'powCoin'
}) {
    if (!participant) return null;

    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const getMinerColorClass = (name) => {
        return name?.toLowerCase() === 'minas' ? 'minas' : 'lars';
    };

    const colorClass = participant.isMiner ? getMinerColorClass(participant.name) : '';

    // Get all transactions involving this participant
    const getTransactionHistory = () => {
        const history = [];
        blocks.forEach((block, blockIndex) => {
            block.transactions?.forEach((tx, txIndex) => {
                if (tx.sender === participant.publicKey || tx.recipient === participant.publicKey) {
                    const isIncoming = tx.recipient === participant.publicKey;
                    const isMiningReward = tx.sender === null;
                    history.push({
                        blockIndex,
                        txIndex,
                        tx,
                        isIncoming,
                        isMiningReward,
                        timestamp: block.timestamp
                    });
                }
            });
        });
        return history.reverse(); // Most recent first
    };

    const txHistory = getTransactionHistory();

    // Calculate stats
    const totalReceived = txHistory.filter(t => t.isIncoming).reduce((sum, t) => sum + t.tx.amount, 0);
    const totalSent = txHistory.filter(t => !t.isIncoming).reduce((sum, t) => sum + t.tx.amount, 0);
    const miningRewards = txHistory.filter(t => t.isMiningReward).reduce((sum, t) => sum + t.tx.amount, 0);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="participant-details-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`modal-header ${participant.isMiner ? `miner-header-${colorClass}` : ''}`}>
                    <div className="modal-title">
                        <span className="modal-icon">
                            {participant.isMiner ? '⛏️' : '👤'}
                        </span>
                        <span className={participant.isMiner ? `miner-${colorClass}` : ''}>
                            {participant.name}
                        </span>
                        {participant.isMiner && (
                            <span className={`winner-badge ${colorClass}`} style={{ marginLeft: '12px' }}>
                                🏆 {participant.blocksWon || 0} blocks
                            </span>
                        )}
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="modal-content">
                    {/* Balance Card */}
                    <div className="participant-balance-card">
                        <div className="balance-amount">
                            {balance?.balance?.toFixed(8) || '0.00000000'}
                        </div>
                        <div className="balance-label">{coinName}</div>
                    </div>

                    {/* Quick Stats */}
                    <div className="modal-stats-grid" style={{ marginBottom: '16px' }}>
                        <div className="modal-stat">
                            <div className="modal-stat-value" style={{ color: 'var(--sapPositiveColor)' }}>
                                +{totalReceived.toFixed(4)}
                            </div>
                            <div className="modal-stat-label">Total Received</div>
                        </div>
                        <div className="modal-stat">
                            <div className="modal-stat-value" style={{ color: 'var(--sapNegativeColor)' }}>
                                -{totalSent.toFixed(4)}
                            </div>
                            <div className="modal-stat-label">Total Sent</div>
                        </div>
                        {participant.isMiner && (
                            <div className="modal-stat">
                                <div className="modal-stat-value" style={{ color: 'var(--sapBrandColor)' }}>
                                    {miningRewards.toFixed(4)}
                                </div>
                                <div className="modal-stat-label">Mining Rewards</div>
                            </div>
                        )}
                        <div className="modal-stat">
                            <div className="modal-stat-value">{txHistory.length}</div>
                            <div className="modal-stat-label">Total TXs</div>
                        </div>
                    </div>

                    {/* Miner Settings */}
                    {participant.isMiner && (
                        <div className={`miner-settings-section ${colorClass}`}>
                            <div className="section-header">
                                <span className="section-title">⛏️ Miner Settings</span>
                                <button
                                    className={`btn btn-sm ${participant.minerEnabled ? 'btn-emphasized' : 'btn-transparent'}`}
                                    onClick={() => toggleMiner?.(participant.name)}
                                    disabled={isMining}
                                >
                                    {participant.minerEnabled ? '✓ Enabled' : 'Disabled'}
                                </button>
                            </div>
                            <div className="hashpower-control">
                                <span className="hashpower-label">Hashpower:</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={participant.hashpower || 5}
                                    onChange={(e) => setMinerHashpower?.(participant.name, parseInt(e.target.value))}
                                    disabled={isMining}
                                    className="hashpower-slider"
                                />
                                <span className="hashpower-value">{participant.hashpower || 5}/10</span>
                            </div>
                            <div className="miner-hint">
                                Higher hashpower = more iterations per round = faster mining
                            </div>
                        </div>
                    )}

                    {/* Keys Section */}
                    <div className="modal-section">
                        <div className="modal-section-label">Public Key (Wallet Address)</div>
                        <div className="modal-hash">
                            {participant.publicKey}
                        </div>
                    </div>

                    <div className="modal-section">
                        <div className="modal-section-label">🔐 Recovery Seed Phrase (Never Share!)</div>
                        <div className="seed-phrase-container">
                            {participant.seedPhrase?.split(' ').map((word, idx) => (
                                <div key={idx} className="seed-word">
                                    <span className="seed-word-number">{idx + 1}</span>
                                    <span className="seed-word-text">{word}</span>
                                </div>
                            )) || <span>No seed phrase available</span>}
                        </div>
                    </div>

                    {/* Transaction History */}
                    <div className="modal-section">
                        <div className="modal-section-label">
                            Transaction History ({txHistory.length})
                        </div>
                        <div className="participant-tx-history">
                            {txHistory.length === 0 ? (
                                <div className="no-transactions">
                                    No transactions yet
                                </div>
                            ) : (
                                txHistory.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`participant-tx-item ${item.isIncoming ? 'incoming' : 'outgoing'}`}
                                        onClick={() => setSelectedTransaction(item.tx)}
                                        style={{ cursor: 'pointer' }}
                                        title="Click for details"
                                    >
                                        <div className="tx-indicator">
                                            {item.isMiningReward ? '⛏️' : item.isIncoming ? '📥' : '📤'}
                                        </div>
                                        <div className="tx-details">
                                            <div className="tx-description">
                                                {item.isMiningReward ? (
                                                    <span className="mining-reward-label">Mining Reward (Block #{item.blockIndex})</span>
                                                ) : item.isIncoming ? (
                                                    <span>From: {getParticipantName(item.tx.sender)}</span>
                                                ) : (
                                                    <span>To: {getParticipantName(item.tx.recipient)}</span>
                                                )}
                                            </div>
                                            {item.tx.referenceNumber && (
                                                <div className="tx-ref">📝 {item.tx.referenceNumber}</div>
                                            )}
                                        </div>
                                        <div className={`tx-amount ${item.isIncoming ? 'positive' : 'negative'}`}>
                                            {item.isIncoming ? '+' : '-'}{item.tx.amount?.toFixed(4)}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {selectedTransaction && (
                <TransactionDetailsModal
                    transaction={selectedTransaction}
                    onClose={() => setSelectedTransaction(null)}
                    coinName={coinName}
                />
            )}
        </div>
    );

    function getParticipantName(publicKey) {
        if (!publicKey) return 'Mining Reward';
        // This is a simple fallback - ideally we'd pass participants list
        return publicKey.substring(0, 8) + '...';
    }
}
