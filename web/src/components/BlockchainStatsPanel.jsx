export function BlockchainStatsPanel({
    blocks = [],
    participants = [],
    difficulty = 3,
    blockReward = 3.125,
    halvingInterval = 4,
    onClose
}) {
    if (!blocks || blocks.length === 0) return null;

    // Calculate statistics with safety
    const blockHeight = Math.max(0, blocks.length - 1); // Genesis block is 0

    // Total transactions (excluding mining rewards)
    const allTransactions = blocks.flatMap(b => b.transactions || []);
    const userTransactions = allTransactions.filter(tx => tx.sender !== null);
    const miningRewards = allTransactions.filter(tx => tx.sender === null);

    // Total coins mined (sum of all mining rewards)
    const totalCoinsMined = miningRewards.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Total transaction volume (excluding mining rewards)
    const totalTxVolume = userTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Total fees collected
    const totalFees = userTransactions.reduce((sum, tx) => sum + (tx.transactionFee || 0), 0);

    // Mining epoch (how many halvings have occurred)
    const currentEpoch = Math.floor(blockHeight / halvingInterval);

    // Blocks until next halving
    const blocksUntilHalving = halvingInterval - (blockHeight % halvingInterval);

    // Initial reward before halvings
    const initialReward = blockReward * Math.pow(2, currentEpoch);

    // Average block time (if more than 1 block)
    let avgBlockTime = 0;
    if (blocks.length > 1) {
        const times = [];
        for (let i = 1; i < blocks.length; i++) {
            const timeDiff = (blocks[i].timestamp - blocks[i - 1].timestamp) / 1000;
            if (timeDiff > 0 && timeDiff < 3600) { // Ignore unrealistic times
                times.push(timeDiff);
            }
        }
        if (times.length > 0) {
            avgBlockTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
    }

    // Distinct wallets that have transacted
    const activeWallets = new Set();
    allTransactions.forEach(tx => {
        if (tx.sender) activeWallets.add(tx.sender);
        if (tx.recipient) activeWallets.add(tx.recipient);
    });

    // Find miners (participants who have mined blocks)
    const minerBlocks = {};
    miningRewards.forEach(tx => {
        const miner = participants.find(p => p.publicKey === tx.recipient);
        if (miner) {
            minerBlocks[miner.name] = (minerBlocks[miner.name] || 0) + 1;
        }
    });

    // Hashrate estimation (rough, based on difficulty and avg block time)
    const estimatedNetworkHashrate = avgBlockTime > 0
        ? Math.round(Math.pow(16, difficulty) / avgBlockTime)
        : 0;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="blockchain-stats-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header" style={{ background: 'linear-gradient(135deg, #0070f2, #004a9f)' }}>
                    <div className="modal-title">
                        <span className="modal-icon">📊</span>
                        <span>Blockchain Insights</span>
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Content */}
                <div className="modal-content">
                    {/* Block Height Hero */}
                    <div className="stats-hero">
                        <div className="stats-hero-value">{blockHeight.toLocaleString()}</div>
                        <div className="stats-hero-label">Current Block Height</div>
                    </div>

                    {/* Main Stats Grid */}
                    <div className="stats-section">
                        <div className="stats-section-title">📈 Chain Statistics</div>
                        <div className="blockchain-stats-grid">
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{allTransactions.length.toLocaleString()}</div>
                                <div className="blockchain-stat-label">Total Transactions</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{userTransactions.length.toLocaleString()}</div>
                                <div className="blockchain-stat-label">User Transfers</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{totalCoinsMined.toFixed(4)}</div>
                                <div className="blockchain-stat-label">Coins Mined</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{totalTxVolume.toFixed(4)}</div>
                                <div className="blockchain-stat-label">Volume Transacted</div>
                            </div>
                        </div>
                    </div>

                    {/* Mining Info */}
                    <div className="stats-section">
                        <div className="stats-section-title">⛏️ Mining Info</div>
                        <div className="blockchain-stats-grid">
                            <div className="blockchain-stat-item highlight">
                                <div className="blockchain-stat-value">{currentEpoch}</div>
                                <div className="blockchain-stat-label">Current Epoch</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{blockReward.toFixed(4)}</div>
                                <div className="blockchain-stat-label">Block Reward</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{blocksUntilHalving.toLocaleString()}</div>
                                <div className="blockchain-stat-label">Blocks to Halving</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{difficulty}</div>
                                <div className="blockchain-stat-label">Difficulty</div>
                            </div>
                        </div>
                    </div>

                    {/* Performance */}
                    <div className="stats-section">
                        <div className="stats-section-title">⏱️ Performance</div>
                        <div className="blockchain-stats-grid">
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">
                                    {avgBlockTime > 0 ? avgBlockTime.toFixed(1) + 's' : '-'}
                                </div>
                                <div className="blockchain-stat-label">Avg Block Time</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">
                                    {estimatedNetworkHashrate > 0 ? estimatedNetworkHashrate.toLocaleString() : '-'}
                                </div>
                                <div className="blockchain-stat-label">Est. Network H/s</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{totalFees.toFixed(8)}</div>
                                <div className="blockchain-stat-label">Total Fees</div>
                            </div>
                            <div className="blockchain-stat-item">
                                <div className="blockchain-stat-value">{activeWallets.size}</div>
                                <div className="blockchain-stat-label">Active Wallets</div>
                            </div>
                        </div>
                    </div>

                    {/* Miner Leaderboard */}
                    {Object.keys(minerBlocks).length > 0 && (
                        <div className="stats-section">
                            <div className="stats-section-title">🏆 Miner Leaderboard</div>
                            <div className="miner-leaderboard">
                                {Object.entries(minerBlocks)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([name, count], idx) => (
                                        <div key={name} className="leaderboard-row">
                                            <span className="leaderboard-rank">
                                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                            </span>
                                            <span className="leaderboard-name">{name}</span>
                                            <span className="leaderboard-blocks">{count} blocks</span>
                                            <span className="leaderboard-percent">
                                                ({blockHeight > 0 ? ((count / blockHeight) * 100).toFixed(1) : 0}%)
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Info Footer */}
                    <div className="stats-info-footer">
                        <p>💡 Click the block height in the header anytime to view these insights</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
