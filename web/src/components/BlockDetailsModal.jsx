import { useState } from 'react';
import { TransactionDetailsModal } from './TransactionDetailsModal';

export function BlockDetailsModal({
    block,
    blockIndex,
    blocks,
    onClose,
    participants,
    coinName = 'powCoin'
}) {
    const [selectedTx, setSelectedTx] = useState(null);

    if (!block) return null;

    const getParticipantName = (publicKey) => {
        if (!publicKey) return 'Mining Reward';
        const participant = participants.find(p => p.publicKey === publicKey);
        return participant ? participant.name : publicKey.substring(0, 12) + '...';
    };

    const getMinerFromBlock = () => {
        const rewardTx = block.transactions?.find(tx => tx.sender === null);
        if (!rewardTx) return null;
        const miner = participants.find(p => p.publicKey === rewardTx.recipient);
        return miner;
    };

    const miner = getMinerFromBlock();
    const minerColorClass = miner?.name?.toLowerCase() === 'minas' ? 'minas' :
        miner?.name?.toLowerCase() === 'lars' ? 'lars' : null;

    const isInvalid = !block.isValid?.() ||
        (blockIndex > 0 && block.previousHash !== blocks[blockIndex - 1]?.hash);

    // Handle transaction click
    const handleTxClick = (tx) => {
        setSelectedTx(tx);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="block-details-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <div className="modal-title">
                        <span className="modal-icon">
                            {blockIndex === 0 ? '🌟' : '📦'}
                        </span>
                        <span>
                            {blockIndex === 0 ? 'Genesis Block' : `Block #${blockIndex}`}
                        </span>
                        {miner && minerColorClass && (
                            <span className={`winner-badge ${minerColorClass}`} style={{ marginLeft: '12px' }}>
                                ⛏️ {miner.name}
                            </span>
                        )}
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="modal-content">
                    {/* Status Badge */}
                    {isInvalid ? (
                        <div className="block-status-badge status-invalid">
                            ⚠️ INVALID BLOCK
                        </div>
                    ) : (
                        <div className="block-status-badge status-valid">
                            ✓ Valid Block
                        </div>
                    )}

                    {/* Hash Section */}
                    <div className="modal-section">
                        <div className="modal-section-label">Block Hash</div>
                        <div className="modal-hash">
                            <span className="leading-zeros">
                                {block.hash?.match(/^0*/)?.[0]}
                            </span>
                            <span className="hash-rest">
                                {block.hash?.replace(/^0*/, '')}
                            </span>
                        </div>
                    </div>

                    <div className="modal-section">
                        <div className="modal-section-label">Previous Hash</div>
                        <div className="modal-hash small">
                            {block.previousHash}
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="modal-stats-grid">
                        <div className="modal-stat">
                            <div className="modal-stat-value">{block.nonce?.toLocaleString()}</div>
                            <div className="modal-stat-label">Nonce</div>
                        </div>
                        <div className="modal-stat">
                            <div className="modal-stat-value">{block.transactions?.length || 0}</div>
                            <div className="modal-stat-label">Transactions</div>
                        </div>
                        <div className="modal-stat">
                            <div className="modal-stat-value">
                                {block.transactions?.reduce((sum, tx) => sum + (tx.amount || 0), 0).toFixed(2)}
                            </div>
                            <div className="modal-stat-label">Volume</div>
                        </div>
                        <div className="modal-stat">
                            <div className="modal-stat-value">
                                {blockIndex === 0 ? '-' : new Date(block.timestamp).toLocaleTimeString()}
                            </div>
                            <div className="modal-stat-label">Mined At</div>
                        </div>
                    </div>

                    {/* Tamper Analysis */}
                    {isInvalid && (
                        <div className="tamper-analysis">
                            <div className="tamper-title">⚠️ Tamper Analysis</div>

                            {block.hash !== block.createHash?.() && (
                                <div className="tamper-item">
                                    <strong>Content Modified!</strong> (Hash Mismatch)
                                    <div className="tamper-detail">
                                        Stored: {block.hash?.substring(0, 20)}...
                                    </div>
                                    <div className="tamper-detail">
                                        Actual: {block.createHash?.()?.substring(0, 20)}...
                                    </div>
                                </div>
                            )}

                            {blockIndex > 0 && block.previousHash !== blocks[blockIndex - 1]?.hash && (
                                <div className="tamper-item">
                                    <strong>Broken Link!</strong> (Previous Hash Mismatch)
                                    <div className="tamper-detail">
                                        Block Prev: {block.previousHash?.substring(0, 20)}...
                                    </div>
                                    <div className="tamper-detail">
                                        Real Prev: {blocks[blockIndex - 1]?.hash?.substring(0, 20)}...
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Transactions */}
                    {block.transactions?.length > 0 && (
                        <div className="modal-section">
                            <div className="modal-section-label">
                                Transactions ({block.transactions.length}) - Click for details
                            </div>
                            <div className="modal-transactions">
                                {block.transactions.map((tx, txIndex) => (
                                    <div
                                        key={txIndex}
                                        className="modal-tx-item clickable"
                                        onClick={() => handleTxClick(tx)}
                                    >
                                        <div className="modal-tx-parties">
                                            <span className={tx.sender === null ? 'mining-reward' : ''}>
                                                {getParticipantName(tx.sender)}
                                            </span>
                                            <span className="tx-arrow">→</span>
                                            <span>{getParticipantName(tx.recipient)}</span>
                                        </div>
                                        <div className="modal-tx-amount">
                                            {tx.amount?.toFixed(8)} {coinName}
                                        </div>
                                        {tx.referenceNumber && (
                                            <div className="modal-tx-ref">
                                                📝 {tx.referenceNumber}
                                            </div>
                                        )}
                                        <div className="tx-click-hint">👆 Click for details</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Transaction Details Modal (nested) */}
            {selectedTx && (
                <TransactionDetailsModal
                    transaction={selectedTx}
                    blockIndex={blockIndex}
                    participants={participants}
                    onClose={() => setSelectedTx(null)}
                />
            )}
        </div>
    );
}
