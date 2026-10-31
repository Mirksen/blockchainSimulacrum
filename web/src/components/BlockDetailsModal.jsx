import { Modal } from './Modal';
import { useState } from 'react';
import { TransactionDetailsModal } from './TransactionDetailsModal';
import { transactionRoot } from '../lib/blockchain';

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
const WarningIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.8l5.6 9.9H1.4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M7 5.6v2.8M7 10.1v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
const ArrowIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ChevronIcon = () => (
    <svg className="details-modal-row-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function BlockDetailsModal({
    block,
    blockIndex,
    blocks,
    onClose,
    participants,
    describeTx,
    coinName = 'powfyicoin'
}) {
    const [selectedTx, setSelectedTx] = useState(null);

    if (!block) return null;

    const views = (block.transactions ?? []).map(describeTx);
    const minerName = views.find(view => view.coinbase)?.to;
    const miner = participants.find(p => p.name === minerName);
    const minerColorClass = miner?.name?.toLowerCase() === 'minas' ? 'minas' :
        miner?.name?.toLowerCase() === 'lars' ? 'lars' : null;

    const recomputedRoot = transactionRoot(block.transactions || []);
    const rootChanged = block.txRoot !== undefined && block.txRoot !== recomputedRoot;

    const isInvalid = !block.isValid?.() ||
        (blockIndex > 0 && block.previousHash !== blocks[blockIndex - 1]?.hash);

    // Handle transaction click
    const handleTxClick = (view) => {
        setSelectedTx(view);
    };

    return (
        <Modal onClose={onClose} label="Block details">
            <div className="details-modal block-details-modal" onClick={e => e.stopPropagation()}>
                <div className="details-modal-head">
                    <h2 className="details-modal-title">
                        <span>{blockIndex === 0 ? 'Genesis block' : `Block #${blockIndex}`}</span>
                        {miner && minerColorClass && (
                            <span className="details-modal-pill" style={{ '--dot': `var(--${minerColorClass})` }}>
                                <i aria-hidden="true" />Mined by {miner.name}
                            </span>
                        )}
                    </h2>
                    <button type="button" className="details-modal-close" aria-label="Close details" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="details-modal-body">
                    <div className="details-modal-status">
                        {isInvalid ? (
                            <span className="details-modal-pill is-err"><i aria-hidden="true" />Invalid block</span>
                        ) : (
                            <span className="details-modal-pill is-ok"><i aria-hidden="true" />Valid block</span>
                        )}
                    </div>

                    <div className="details-modal-section">
                        <div className="details-modal-label">Block Hash</div>
                        <div className="details-modal-hash">
                            <span className="details-modal-zeros">
                                {block.hash?.match(/^0*/)?.[0]}
                            </span>
                            <span>
                                {block.hash?.replace(/^0*/, '')}
                            </span>
                        </div>
                    </div>

                    <div className="details-modal-section">
                        <div className="details-modal-label">Previous Hash</div>
                        <div className="details-modal-hash is-small">
                            {block.previousHash}
                        </div>
                    </div>

                    <div className="details-modal-section">
                        <div className="details-modal-label">Transaction Root</div>
                        <div className="details-modal-hash is-small">
                            {block.txRoot}
                        </div>
                        {rootChanged && (
                            <>
                                <div className="details-modal-note">
                                    <strong>Changed after mining:</strong> recomputed root
                                </div>
                                <div className="details-modal-hash is-small">
                                    {recomputedRoot}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="details-modal-stats">
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">{block.nonce?.toLocaleString()}</div>
                            <div className="details-modal-stat-label">Nonce</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">{block.transactions?.length || 0}</div>
                            <div className="details-modal-stat-label">Transactions</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">
                                {views.reduce((sum, view) => sum + view.amount, 0).toFixed(2)}
                            </div>
                            <div className="details-modal-stat-label">Volume</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">
                                {blockIndex === 0 ? '-' : new Date(block.timestamp).toLocaleTimeString()}
                            </div>
                            <div className="details-modal-stat-label">Mined at</div>
                        </div>
                    </div>

                    {isInvalid && (
                        <div className="details-modal-tamper">
                            <div className="details-modal-tamper-title"><WarningIcon />Tamper analysis</div>

                            {block.hash !== block.createHash?.() && (
                                <div className="details-modal-tamper-item">
                                    <strong>Content modified</strong> (hash mismatch)
                                    <div className="details-modal-tamper-detail">
                                        Stored: {block.hash?.substring(0, 20)}...
                                    </div>
                                    <div className="details-modal-tamper-detail">
                                        Actual: {block.createHash?.()?.substring(0, 20)}...
                                    </div>
                                </div>
                            )}

                            {blockIndex > 0 && block.previousHash !== blocks[blockIndex - 1]?.hash && (
                                <div className="details-modal-tamper-item">
                                    <strong>Broken link</strong> (previous hash mismatch)
                                    <div className="details-modal-tamper-detail">
                                        Block prev: {block.previousHash?.substring(0, 20)}...
                                    </div>
                                    <div className="details-modal-tamper-detail">
                                        Real prev: {blocks[blockIndex - 1]?.hash?.substring(0, 20)}...
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {block.transactions?.length > 0 && (
                        <div className="details-modal-section">
                            <div className="details-modal-label">
                                Transactions ({block.transactions.length}) · select one for details
                            </div>
                            <div className="details-modal-list">
                                {views.map((view, txIndex) => (
                                    <div
                                        key={txIndex}
                                        className="details-modal-row"
                                        onClick={() => handleTxClick(view)} role="button" tabIndex={0} aria-label={`Transfer to ${view.to}: ${view.amount}`} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.currentTarget.click(); } }}
                                    >
                                        <div className="details-modal-row-main">
                                            <div className="details-modal-row-title">
                                                <span className={view.coinbase ? 'details-modal-quiet' : undefined}>
                                                    {view.coinbase ? 'Mining reward' : view.from}
                                                </span>
                                                <ArrowIcon />
                                                <span>{view.to}</span>
                                            </div>
                                            {view.memo && (
                                                <div className="details-modal-row-meta">
                                                    Ref: {view.memo}
                                                </div>
                                            )}
                                        </div>
                                        <div className="details-modal-row-amount">
                                            {view.amount.toFixed(8)} {coinName}
                                        </div>
                                        <ChevronIcon />
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
                    coinName={coinName}
                    onClose={() => setSelectedTx(null)}
                />
            )}
        </Modal>
    );
}
