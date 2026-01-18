import { BlockCard } from './BlockCard';
import { useMemo } from 'react';

export function BlockchainViewer({
    blocks,
    selectedBlock,
    onSelectBlock,
    chainValid,
    participants,
    coinName = 'powCoin',
    onMine,
    isMining
}) {
    // Compute which blocks have balance issues by replaying transactions
    const invalidBalanceBlocks = useMemo(() => {
        const invalidIndices = new Set();
        const balances = {};

        for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
            const block = blocks[blockIdx];
            const transactions = block.transactions || [];

            // First pass: Credit all incoming transactions (including mining rewards)
            for (const tx of transactions) {
                if (tx.recipient) {
                    balances[tx.recipient] = (balances[tx.recipient] || 0) + tx.amount;
                }
            }

            // Second pass: Check and debit sender balances
            for (const tx of transactions) {
                if (tx.sender) {
                    const senderBalance = balances[tx.sender] || 0;
                    const required = tx.amount + (tx.transactionFee || 0);
                    if (senderBalance < required) {
                        invalidIndices.add(blockIdx);
                        console.log(`❌ Block ${blockIdx} invalid: ${tx.sender.substring(0, 8)}... has ${senderBalance.toFixed(4)} but needs ${required.toFixed(4)}`);
                    }
                    balances[tx.sender] = senderBalance - required;
                }
            }
        }
        return invalidIndices;
    }, [blocks]);

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
        <div className="fiori-card" style={{ overflow: 'hidden' }}>
            <div className="fiori-card-header">
                <h3>🔗 Blockchain</h3>
                <div
                    className={`validation-status ${chainValid ? 'validation-valid' : 'validation-invalid'}`}
                    title={chainValid
                        ? "All blocks verified: Hash integrity ✓, Chain links ✓, Transaction balances ✓"
                        : "Validation failed: Block hash modified, chain link broken, or insufficient balance detected"
                    }
                    style={{ cursor: 'help' }}
                >
                    {chainValid ? '✓ Chain Valid' : '✗ Chain Corrupted'}
                </div>
            </div>

            {/* Chain Visualization */}
            <div className="fiori-card-content">
                <div className="blockchain-chain" style={{ flexDirection: 'column', alignItems: 'center' }}>
                    {blocks.map((block, index) => (
                        <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                            <BlockCard
                                block={block}
                                index={index}
                                isGenesis={index === 0}
                                isLatest={index === blocks.length - 1}
                                isSelected={selectedBlock === index}
                                isValid={
                                    // Check hash validity
                                    (block.isValid && block.isValid()) &&
                                    // Check chain link validity (previousHash matches previous block's hash)
                                    (index === 0 || block.previousHash === blocks[index - 1].hash) &&
                                    // Check balance validity (no insufficient funds in this block)
                                    !invalidBalanceBlocks.has(index)
                                }
                                onClick={() => onSelectBlock(selectedBlock === index ? null : index)}
                                elapsedTime={index === 0 ? null : (block.timestamp - blocks[index - 1].timestamp)}
                            />
                            {index < blocks.length - 1 && (
                                <div className="chain-connector" style={{ margin: '8px 0', fontSize: '24px', color: 'var(--sapBrandColor)', fontWeight: 'bold' }}>
                                    ↓
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Mine Next Block Button - Moved here as requested */}
                    <div style={{ marginTop: '24px', marginBottom: '16px', display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <button
                            className="btn btn-emphasized"
                            onClick={onMine}
                            disabled={isMining}
                            title="Higher difficulty = more zeros required = exponentially more time to mine&#013;Mining empty block will only create the coinbase reward."
                            style={{ minWidth: '200px', fontWeight: 'bold' }}
                        >
                            {isMining ? (
                                <>
                                    <span className="animate-spin" style={{ marginRight: '8px' }}>⚙️</span>
                                    Mining...
                                </>
                            ) : (
                                'Mine Next Block'
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Block Details */}
            {selectedBlock !== null && blocks[selectedBlock] && (
                <div className="fiori-card-content animate-fadeIn" style={{
                    borderTop: '1px solid var(--sapList_BorderColor)',
                    background: 'var(--sapBackgroundColor)'
                }}>
                    <h4 style={{ marginBottom: '16px', color: 'var(--sapTitleColor)' }}>
                        {selectedBlock === 0 ? '🌟 Genesis Block' : `📦 Block #${selectedBlock}`}
                    </h4>

                    <div style={{ display: 'grid', gap: '16px' }}>
                        <div>
                            <div className="form-label">Block Hash</div>
                            <div className="mining-hash">
                                <span className="leading-zeros">
                                    {blocks[selectedBlock].hash.match(/^0*/)?.[0]}
                                </span>
                                {blocks[selectedBlock].hash.replace(/^0*/, '')}
                            </div>
                        </div>

                        <div>
                            <div className="form-label">Previous Hash</div>
                            <div className="mining-hash" style={{ fontSize: '11px' }}>
                                {blocks[selectedBlock].previousHash}
                            </div>
                        </div>

                        <div className="mining-stats" style={{ margin: 0 }}>
                            <div className="mining-stat" data-tooltip="Number of hash attempts to find valid block">
                                <div className="mining-stat-value">{blocks[selectedBlock].nonce.toLocaleString()}</div>
                                <div className="mining-stat-label">Nonce</div>
                            </div>
                            <div className="mining-stat" data-tooltip="Number of transactions included in this block">
                                <div className="mining-stat-value">{blocks[selectedBlock].transactions.length}</div>
                                <div className="mining-stat-label">Transactions</div>
                            </div>
                            <div className="mining-stat" data-tooltip="Total amount transferred in this block">
                                <div className="mining-stat-value">
                                    {blocks[selectedBlock].transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0).toFixed(2)}
                                </div>
                                <div className="mining-stat-label">Volume</div>
                            </div>
                            <div className="mining-stat" data-tooltip="Timestamp when this block was mined">
                                <div className="mining-stat-value" style={{ fontSize: '14px' }}>
                                    {selectedBlock === 0 ? '-' : new Date(blocks[selectedBlock].timestamp).toLocaleTimeString()}
                                </div>
                                <div className="mining-stat-label">Mined At</div>
                            </div>
                        </div>


                        {/* Tamper Analysis */}
                        {(!blocks[selectedBlock].isValid() || (selectedBlock > 0 && blocks[selectedBlock].previousHash !== blocks[selectedBlock - 1].hash)) && (
                            <div className="animate-pulse" style={{ marginBottom: '16px', padding: '12px', background: '#ffebeb', border: '1px solid var(--sapNegativeColor)', borderRadius: '4px', color: '#bb0000' }}>
                                <div className="form-label" style={{ color: 'inherit', fontWeight: 'bold' }}>⚠️ Tamper Analysis</div>

                                {blocks[selectedBlock].hash !== blocks[selectedBlock].createHash() && (
                                    <div style={{ fontSize: '11px', marginTop: '8px' }}>
                                        <div><strong>Content Modified!</strong> (Hash Mismatch)</div>
                                        <div style={{ fontFamily: 'monospace' }}>Stored: {blocks[selectedBlock].hash.substring(0, 16)}...</div>
                                        <div style={{ fontFamily: 'monospace' }}>Actual: {blocks[selectedBlock].createHash().substring(0, 16)}...</div>
                                    </div>
                                )}

                                {selectedBlock > 0 && blocks[selectedBlock].previousHash !== blocks[selectedBlock - 1].hash && (
                                    <div style={{ fontSize: '11px', marginTop: '8px' }}>
                                        <div><strong>Broken Link!</strong> (Previous Hash Mismatch)</div>
                                        <div style={{ fontFamily: 'monospace' }}>Block Prev: {blocks[selectedBlock].previousHash.substring(0, 16)}...</div>
                                        <div style={{ fontFamily: 'monospace' }}>Real Prev:  {blocks[selectedBlock - 1].hash.substring(0, 16)}...</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Transactions in block */}
                        {blocks[selectedBlock].transactions.length > 0 && (
                            <div>
                                <div className="form-label" style={{ marginBottom: '8px' }}>Transactions</div>
                                <div style={{
                                    background: 'var(--sapGroup_ContentBackground)',
                                    borderRadius: '4px',
                                    border: '1px solid var(--sapList_BorderColor)'
                                }}>
                                    {blocks[selectedBlock].transactions.map((tx, txIndex) => (
                                        <div key={txIndex} className="tx-item">
                                            <div className="tx-header">
                                                <span className="tx-parties">
                                                    {getParticipantName(tx.sender)} → {getParticipantName(tx.recipient)}
                                                </span>
                                                <span className="tx-amount">{tx.amount.toFixed(8)} {coinName}</span>
                                            </div>
                                            {tx.referenceNumber && (
                                                <div className="tx-reference">📝 {tx.referenceNumber}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
