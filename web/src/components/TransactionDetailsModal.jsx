import { Modal } from './Modal';

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
const ArrowIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12M11 5l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

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

    // Signature verification status; tone picks the status color (none, ok, err)
    const getSignatureStatus = () => {
        if (isMiningReward) return { status: 'system', text: 'System generated', short: 'System', tone: '' };
        if (!transaction.signature) return { status: 'unsigned', text: 'Not signed', short: 'Missing', tone: 'is-err' };
        return { status: 'signed', text: 'Signature present', short: 'Present', tone: 'is-ok' };
    };

    const sigStatus = getSignatureStatus();

    return (
        <Modal onClose={onClose} label="Transaction details">
            <div className="details-modal transaction-details-modal" onClick={e => e.stopPropagation()}>
                <div className="details-modal-head">
                    <h2 className="details-modal-title">
                        {isMiningReward ? 'Mining reward' : 'Transaction details'}
                    </h2>
                    <button type="button" className="details-modal-close" aria-label="Close details" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="details-modal-body">
                    <div className="details-modal-type">
                        <span className="details-modal-pill">
                            {isMiningReward ? 'Mining reward' : 'Transfer'}
                        </span>
                    </div>

                    <div className="details-modal-amount">
                        <div className="details-modal-amount-value">
                            {transaction.amount?.toFixed(8)}
                        </div>
                        <div className="details-modal-amount-label">Amount</div>
                        {transaction.transactionFee > 0 && (
                            <div className="details-modal-amount-fee">
                                + {transaction.transactionFee?.toFixed(8)} fee
                            </div>
                        )}
                    </div>

                    <div className="details-modal-parties">
                        <div className="details-modal-party">
                            <div className="details-modal-label">
                                {isMiningReward ? 'Source' : 'Sender'}
                            </div>
                            <div className="details-modal-party-name">
                                {isMiningReward ? 'Network' : (senderName || 'Unknown')}
                            </div>
                            <div className="details-modal-party-key">
                                {isMiningReward ? 'Coinbase (newly minted coins)' : transaction.sender}
                            </div>
                        </div>
                        <div className="details-modal-arrow">
                            <ArrowIcon />
                        </div>
                        <div className="details-modal-party">
                            <div className="details-modal-label">Recipient</div>
                            <div className="details-modal-party-name">{recipientName || 'Unknown'}</div>
                            <div className="details-modal-party-key">{transaction.recipient}</div>
                        </div>
                    </div>

                    {transaction.referenceNumber && (
                        <div className="details-modal-section">
                            <div className="details-modal-label">Reference / memo</div>
                            <div className="details-modal-text">
                                {transaction.referenceNumber}
                            </div>
                        </div>
                    )}

                    <div className="details-modal-section">
                        <div className="details-modal-label">Transaction hash (TXID)</div>
                        <div className="details-modal-hash">
                            {txHash}
                        </div>
                    </div>

                    <div className="details-modal-section">
                        <div className="details-modal-label">Digital signature</div>
                        <div className={`details-modal-sig ${sigStatus.tone}`}>
                            {sigStatus.text}
                        </div>
                        {transaction.signature && <div className="details-modal-hash is-small"><code>{transaction.signature}</code></div>}
                    </div>

                    <div className="details-modal-stats">
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">#{blockIndex}</div>
                            <div className="details-modal-stat-label">Block</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value is-small">
                                {formatTimestamp(transaction.timestamp)}
                            </div>
                            <div className="details-modal-stat-label">Created at</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">
                                {isMiningReward ? 'N/A' : (transaction.transactionFee?.toFixed(4) || '0')}
                            </div>
                            <div className="details-modal-stat-label">Fee</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className={`details-modal-stat-value is-ui ${sigStatus.tone}`}>
                                {sigStatus.short}
                            </div>
                            <div className="details-modal-stat-label">Signature</div>
                        </div>
                    </div>

                    <div className="details-modal-info">
                        <div className="details-modal-info-title">How transactions work</div>
                        <ul>
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
