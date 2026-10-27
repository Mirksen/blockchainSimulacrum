import { Modal } from './Modal';

export function TransactionDetailsModal({
    transaction,
    blockIndex,
    participants,
    onClose
}) {
    if (!transaction) return null;

    // Helper to get participant name from public key
    const getParticipantName = (publicKey) => {
        if (!publicKey) return null;
        const participant = participants?.find(p => p.publicKey === publicKey);
        return participant?.name || null;
    };

    const senderName = getParticipantName(transaction.sender);
    const recipientName = getParticipantName(transaction.recipient);
    const isMiningReward = transaction.sender === null;

    const txHash = transaction.createHash();

    // Format timestamp
    const formatTimestamp = (ts) => {
        if (!ts) return 'N/A';
        try {
            return new Date(ts).toLocaleString();
        } catch {
            return ts;
        }
    };

    // Signature verification status
    const getSignatureStatus = () => {
        if (isMiningReward) return { status: 'system', text: 'System Generated', color: 'var(--sapBrandColor)' };
        if (!transaction.signature) return { status: 'unsigned', text: 'Not Signed', color: 'var(--sapNegativeColor)' };
        return { status: 'signed', text: 'Signature present', color: 'var(--sapPositiveColor)' };
    };

    const sigStatus = getSignatureStatus();

    return (
        <Modal onClose={onClose} label="Transaction details">
            <div className="transaction-details-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`modal-header ${isMiningReward ? 'mining-reward-header' : ''}`}>
                    <div className="modal-title">
                        <span className="modal-icon">
                            {isMiningReward ? '⛏️' : '💸'}
                        </span>
                        <span>
                            {isMiningReward ? 'Mining Reward' : 'Transaction Details'}
                        </span>
                    </div>
                    <button className="modal-close-btn" aria-label="Close details" onClick={onClose}>
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="modal-content">
                    {/* Transaction Type Badge */}
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <span className={`tx-type-badge ${isMiningReward ? 'mining-reward' : 'transfer'}`}>
                            {isMiningReward ? '⛏️ MINING REWARD' : '💱 TRANSFER'}
                        </span>
                    </div>

                    {/* Amount Display */}
                    <div className="tx-amount-card">
                        <div className="tx-amount-value">
                            {transaction.amount?.toFixed(8)}
                        </div>
                        <div className="tx-amount-label">Amount</div>
                        {transaction.transactionFee > 0 && (
                            <div className="tx-fee-info">
                                + {transaction.transactionFee?.toFixed(8)} fee
                            </div>
                        )}
                    </div>

                    {/* Parties */}
                    <div className="tx-parties-section">
                        <div className="tx-party sender">
                            <div className="tx-party-label">
                                {isMiningReward ? 'Source' : 'Sender'}
                            </div>
                            <div className="tx-party-name">
                                {isMiningReward ? '🌐 Network' : (senderName || 'Unknown')}
                            </div>
                            <div className="tx-party-key">
                                {isMiningReward ? 'Coinbase (newly minted coins)' : transaction.sender}
                            </div>
                        </div>
                        <div className="tx-arrow-container">
                            <div className="tx-arrow">→</div>
                        </div>
                        <div className="tx-party recipient">
                            <div className="tx-party-label">Recipient</div>
                            <div className="tx-party-name">{recipientName || 'Unknown'}</div>
                            <div className="tx-party-key">{transaction.recipient}</div>
                        </div>
                    </div>

                    {/* Reference Number */}
                    {transaction.referenceNumber && (
                        <div className="modal-section">
                            <div className="modal-section-label">📝 Reference / Memo</div>
                            <div className="tx-reference">
                                {transaction.referenceNumber}
                            </div>
                        </div>
                    )}

                    {/* Transaction Hash */}
                    <div className="modal-section">
                        <div className="modal-section-label">🔗 Transaction Hash (TXID)</div>
                        <div className="modal-hash">
                            {txHash}
                        </div>
                    </div>

                    {/* Signature Section */}
                    <div className="modal-section">
                        <div className="modal-section-label">🔐 Digital Signature</div>
                        <div className="signature-status" style={{ color: sigStatus.color }}>
                            {sigStatus.text}
                        </div>
                        {transaction.signature && <div className="signature-display"><code className="sig-value">{transaction.signature}</code></div>}
                    </div>

                    {/* Metadata */}
                    <div className="modal-stats-grid">
                        <div className="modal-stat">
                            <div className="modal-stat-value">#{blockIndex}</div>
                            <div className="modal-stat-label">Block</div>
                        </div>
                        <div className="modal-stat">
                            <div className="modal-stat-value" style={{ fontSize: '11px' }}>
                                {formatTimestamp(transaction.timestamp)}
                            </div>
                            <div className="modal-stat-label">Created At</div>
                        </div>
                        <div className="modal-stat">
                            <div className="modal-stat-value">
                                {isMiningReward ? 'N/A' : (transaction.transactionFee?.toFixed(4) || '0')}
                            </div>
                            <div className="modal-stat-label">Fee</div>
                        </div>
                        <div className="modal-stat">
                            <div className="modal-stat-value" style={{ color: sigStatus.color }}>
                                {sigStatus.status === 'signed' ? '✓' : sigStatus.status === 'system' ? '⚡' : '✗'}
                            </div>
                            <div className="modal-stat-label">Signature</div>
                        </div>
                    </div>

                    {/* Educational Info */}
                    <div className="tx-info-box">
                        <div className="tx-info-title">💡 How Transactions Work</div>
                        <ul className="tx-info-list">
                            <li>The <strong>sender</strong> signs the transaction with their private key</li>
                            <li>The <strong>signature</strong> proves ownership without revealing the private key</li>
                            <li>The <strong>TXID</strong> identifies the transfer details in this demo</li>
                            <li>Changing a mined transaction breaks the chain’s <strong>integrity checks</strong></li>
                        </ul>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
