import { Modal } from './Modal';
import { useState } from 'react';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { Participant } from '../lib/blockchain';
import { WALLET_DERIVATION_PATH } from '../lib/wallet';

// Wallet and miner colors that have a token in styles/tokens.css.
const KNOWN_COLORS = ['lars', 'minas', 'alice', 'bob', 'chris'];

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
// Mined block: a small cube.
const RewardIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.8l4.8 2.6v5.2L7 12.2 2.2 9.6V4.4z M2.2 4.4L7 7l4.8-2.6M7 7v5.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
);
const IncomingIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M10 4L4 10M4 5.5V10h4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const OutgoingIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 10l6-6M5.5 4H10v4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ChevronIcon = () => (
    <svg className="details-modal-row-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Avatar({ name }) {
    const key = String(name).toLowerCase();
    const style = KNOWN_COLORS.includes(key) ? { '--av-color': `var(--${key})` } : undefined;
    return <span className={`details-modal-av${style ? '' : ' is-plain'}`} style={style} aria-hidden="true">{String(name).charAt(0).toUpperCase()}</span>;
}

export function ParticipantDetailsModal({
    participant,
    balance,
    blocks,
    onClose,
    toggleMiner,
    setMinerHashpower,
    isMining,
    coinName = 'powfyicoin'
}) {
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [recoveryResult, setRecoveryResult] = useState(null);
    if (!participant) return null;

    const verifyRecovery = () => {
        let verified = false;
        try {
            const recovered = Participant.fromSeedPhrase(participant.name, participant.seedPhrase);
            verified = recovered.publicKey === participant.publicKey;
        } catch {
            // Keep failure details and key material local; show only a fixed message.
        }
        setRecoveryResult({ publicKey: participant.publicKey, verified });
    };

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
                        timestamp: block.time * 1000
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
        <Modal onClose={onClose} label="Participant details">
            <div className="details-modal participant-details-modal" onClick={e => e.stopPropagation()}>
                <div className="details-modal-head">
                    <h2 className="details-modal-title">
                        <Avatar name={participant.name} />
                        <span>{participant.name}</span>
                        {participant.isMiner && (
                            <span className="details-modal-pill">
                                Miner · {participant.blocksWon || 0} blocks won
                            </span>
                        )}
                    </h2>
                    <button type="button" className="details-modal-close" aria-label="Close details" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="details-modal-body">
                    <div className="details-modal-balance">
                        <div className="balance-amount">
                            {balance?.balance?.toFixed(8) || '0.00000000'}
                        </div>
                        <div className="details-modal-balance-label">{coinName}</div>
                    </div>

                    <div className="details-modal-stats">
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">
                                +{totalReceived.toFixed(4)}
                            </div>
                            <div className="details-modal-stat-label">Total received</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">
                                -{totalSent.toFixed(4)}
                            </div>
                            <div className="details-modal-stat-label">Total sent</div>
                        </div>
                        {participant.isMiner && (
                            <div className="details-modal-stat">
                                <div className="details-modal-stat-value">
                                    {miningRewards.toFixed(4)}
                                </div>
                                <div className="details-modal-stat-label">Mining rewards</div>
                            </div>
                        )}
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">{txHistory.length}</div>
                            <div className="details-modal-stat-label">Total TXs</div>
                        </div>
                    </div>

                    {participant.isMiner && (
                        <div className="details-modal-miner">
                            <div className="details-modal-miner-head">
                                <span className="details-modal-miner-title">Miner settings</span>
                                <button
                                    type="button"
                                    className={`details-modal-btn${participant.minerEnabled ? ' is-on' : ''}`}
                                    onClick={() => toggleMiner?.(participant.name)}
                                    disabled={isMining}
                                >
                                    {participant.minerEnabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                            <div className="details-modal-hashpower">
                                <span className="details-modal-hashpower-label">Hashpower</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={participant.hashpower || 5}
                                    onChange={(e) => setMinerHashpower?.(participant.name, parseInt(e.target.value))}
                                    disabled={isMining}
                                    aria-label="Miner hashpower"
                                />
                                <span className="details-modal-hashpower-value">{participant.hashpower || 5}/10</span>
                            </div>
                            <p className="details-modal-note">
                                Higher hashpower = more iterations per round = faster mining
                            </p>
                        </div>
                    )}

                    <div className="details-modal-section">
                        <div className="details-modal-label">Demo public key</div>
                        <div className="details-modal-hash">
                            {participant.publicKey}
                        </div>
                    </div>

                    <div className="details-modal-section">
                        <div className="details-modal-label">Demo recovery phrase (BIP39)</div>
                        <p className="details-modal-note">These words recover this demo key. Resetting still clears the simulated ledger. Never use this simulation for real funds.</p>
                        <div className="details-modal-seed">
                            {participant.seedPhrase?.split(' ').map((word, idx) => (
                                <div key={idx} className="details-modal-seed-word">
                                    <span className="details-modal-seed-number">{idx + 1}</span>
                                    <span className="details-modal-seed-text">{word}</span>
                                </div>
                            )) || <span>No seed phrase available</span>}
                        </div>
                        <p className="details-modal-note">Derivation: <code>{WALLET_DERIVATION_PATH}</code>, empty passphrase.</p>
                        <button type="button" className="details-modal-btn" onClick={verifyRecovery} disabled={isMining}>
                            Verify recovery
                        </button>
                        {recoveryResult?.publicKey === participant.publicKey && (
                            <p role="status" className={`details-modal-result${recoveryResult.verified ? ' is-ok' : ''}`}>
                                {recoveryResult.verified
                                    ? 'Verified: this phrase recovers the same demo public key.'
                                    : 'Recovery could not be verified.'}
                            </p>
                        )}
                    </div>

                    <div className="details-modal-section">
                        <div className="details-modal-label">
                            Transaction history ({txHistory.length})
                        </div>
                        <div className="details-modal-list">
                            {txHistory.length === 0 ? (
                                <div className="details-modal-empty">
                                    No transactions yet
                                </div>
                            ) : (
                                txHistory.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="details-modal-row"
                                        onClick={() => setSelectedTransaction(item.tx)} role="button" tabIndex={0} aria-label={`Transaction in block ${item.blockIndex}: ${item.tx.amount}`} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.currentTarget.click(); } }}
                                        title="Click for details"
                                    >
                                        <div className="details-modal-row-icon">
                                            {item.isMiningReward ? <RewardIcon /> : item.isIncoming ? <IncomingIcon /> : <OutgoingIcon />}
                                        </div>
                                        <div className="details-modal-row-main">
                                            <div className="details-modal-row-title">
                                                {item.isMiningReward ? (
                                                    <span>Mining reward (block #{item.blockIndex})</span>
                                                ) : item.isIncoming ? (
                                                    <span>From: {getParticipantName(item.tx.sender)}</span>
                                                ) : (
                                                    <span>To: {getParticipantName(item.tx.recipient)}</span>
                                                )}
                                            </div>
                                            {item.tx.referenceNumber && (
                                                <div className="details-modal-row-meta">Ref: {item.tx.referenceNumber}</div>
                                            )}
                                        </div>
                                        <div className="details-modal-row-amount">
                                            {item.isIncoming ? '+' : '-'}{item.tx.amount?.toFixed(4)}
                                        </div>
                                        <ChevronIcon />
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
        </Modal>
    );

    function getParticipantName(publicKey) {
        if (!publicKey) return 'Mining reward';
        // This is a simple fallback - ideally we'd pass participants list
        return publicKey.substring(0, 8) + '...';
    }
}
