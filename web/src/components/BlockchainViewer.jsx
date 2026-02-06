import { BlockCard } from './BlockCard';
import { BlockDetailsModal } from './BlockDetailsModal';
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

    const validationContext = useMemo(() => {
        if (!chainValid) {
            const firstInvalid = blocks.findIndex((block, idx) => {
                if (!block.isValid()) return true;
                if (idx > 0 && block.previousHash !== blocks[idx - 1].hash) return true;
                return false;
            });
            return `Block #${firstInvalid} is corrupted. Check hash integrity and chain links.`;
        }
        return 'All block hashes match and chain links are valid.';
    }, [chainValid, blocks]);

    return (
        <div className="fiori-card" style={{ overflow: 'visible' }}>
            <div className="fiori-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>⛓️ Blockchain</h3>
                <span
                    className={chainValid ? 'status-positive' : 'status-negative'}
                    style={{ cursor: 'help' }}
                    title={validationContext}
                >
                    {chainValid ? '✓ Chain Valid' : '✗ Chain Corrupted'}
                </span>
            </div>

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
                                participants={participants}
                            />
                            {index < blocks.length - 1 && (
                                <div className="chain-connector" style={{ margin: '8px 0', fontSize: '24px', color: 'var(--sapBrandColor)', fontWeight: 'bold' }}>
                                    ↓
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Mine Next Block Button */}
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

            {/* Block Details Modal */}
            {selectedBlock !== null && blocks[selectedBlock] && (
                <BlockDetailsModal
                    block={blocks[selectedBlock]}
                    blockIndex={selectedBlock}
                    blocks={blocks}
                    onClose={() => onSelectBlock(null)}
                    participants={participants}
                    coinName={coinName}
                />
            )}
        </div>
    );
}
