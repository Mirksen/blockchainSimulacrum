import { BlockCard } from './BlockCard';

export function BlockchainViewer({
    blocks,
    selectedBlock,
    onSelectBlock,
    chainValid,
    participants
}) {
    const getParticipantName = (publicKey) => {
        if (!publicKey) return 'Mining Reward';
        const participant = participants.find(p => p.publicKey === publicKey);
        return participant ? participant.name : truncateKey(publicKey);
    };

    const truncateKey = (key) => {
        if (!key) return '';
        return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
    };

    return (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div className="glass-card-header">
                <h3>🔗 Blockchain</h3>
                <div className={`validation-status ${chainValid ? 'validation-valid' : 'validation-invalid'}`}
                    style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
                    {chainValid ? '✓ Chain Valid' : '✗ Chain Corrupted'}
                </div>
            </div>

            {/* Chain Visualization */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '16px',
                marginBottom: '16px'
            }}>
                {blocks.map((block, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                        <BlockCard
                            block={block}
                            index={index}
                            isGenesis={index === 0}
                            isSelected={selectedBlock === index}
                            isValid={block.isValid && block.isValid()}
                            onClick={() => onSelectBlock(selectedBlock === index ? null : index)}
                        />
                        {index < blocks.length - 1 && (
                            <div className="chain-connector">
                                <div className="chain-line" style={{ width: '40px' }}></div>
                                <span style={{ margin: '0 4px' }}>→</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Block Details */}
            {selectedBlock !== null && blocks[selectedBlock] && (
                <div className="animate-fadeIn" style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-lg)'
                }}>
                    <h4 style={{ marginBottom: 'var(--space-md)' }}>
                        {selectedBlock === 0 ? '🌟 Genesis Block' : `📦 Block #${selectedBlock}`}
                    </h4>

                    <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                        <div>
                            <div className="form-label">Block Hash</div>
                            <div className="mining-hash">
                                <span className="leading-zeros" style={{ color: 'var(--color-success)' }}>
                                    {blocks[selectedBlock].hash.match(/^0*/)?.[0]}
                                </span>
                                {blocks[selectedBlock].hash.replace(/^0*/, '')}
                            </div>
                        </div>

                        <div>
                            <div className="form-label">Previous Hash</div>
                            <div className="mining-hash text-sm">
                                {blocks[selectedBlock].previousHash}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
                            <div className="mining-stat">
                                <div className="mining-stat-value">{blocks[selectedBlock].nonce}</div>
                                <div className="mining-stat-label">Nonce</div>
                            </div>
                            <div className="mining-stat">
                                <div className="mining-stat-value">{blocks[selectedBlock].transactions.length}</div>
                                <div className="mining-stat-label">Transactions</div>
                            </div>
                            <div className="mining-stat">
                                <div className="mining-stat-value">
                                    {selectedBlock === 0 ? '-' : new Date(blocks[selectedBlock].timestamp).toLocaleTimeString()}
                                </div>
                                <div className="mining-stat-label">Mined At</div>
                            </div>
                        </div>

                        {/* Transactions in block */}
                        {blocks[selectedBlock].transactions.length > 0 && (
                            <div>
                                <div className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>Transactions</div>
                                {blocks[selectedBlock].transactions.map((tx, txIndex) => (
                                    <div key={txIndex} className="tx-item">
                                        <div className="tx-header">
                                            <span className="tx-parties">
                                                {getParticipantName(tx.sender)} → {getParticipantName(tx.recipient)}
                                            </span>
                                            <span className="tx-amount">{tx.amount.toFixed(8)} LKC</span>
                                        </div>
                                        {tx.referenceNumber && (
                                            <div className="tx-reference">📝 {tx.referenceNumber}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
