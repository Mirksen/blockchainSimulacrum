import { useMemo } from 'react';

export function StatsDashboard({ blocks, blockchain, difficulty }) {
    const stats = useMemo(() => {
        if (!blocks || blocks.length <= 1) {
            return null;
        }

        // Total blocks mined (excluding genesis)
        const totalBlocks = blocks.length - 1;

        // Calculate block times
        const blockTimes = [];
        let highestHashRate = 0;
        let highestZeros = 0;
        let fastestBlock = Infinity;
        let slowestBlock = 0;
        let totalCoins = 0;

        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const prevBlock = blocks[i - 1];

            // Block time calculation
            const blockTime = (block.timestamp - prevBlock.timestamp) / 1000;
            if (blockTime > 0 && blockTime < 3600) { // Sanity check (< 1 hour)
                blockTimes.push(blockTime);
                if (blockTime < fastestBlock) fastestBlock = blockTime;
                if (blockTime > slowestBlock) slowestBlock = blockTime;
            }

            // Leading zeros calculation
            const leadingZeros = block.hash?.match(/^0*/)?.[0]?.length || 0;
            if (leadingZeros > highestZeros) highestZeros = leadingZeros;

            // Sum coins from mining rewards
            for (const tx of block.transactions) {
                if (!tx.sender) { // Mining reward
                    totalCoins += tx.amount;
                }
            }
        }

        // Average block time
        const avgBlockTime = blockTimes.length > 0
            ? blockTimes.reduce((a, b) => a + b, 0) / blockTimes.length
            : 0;

        // Halving calculations
        const halvingInterval = blockchain?.halvingEvent || 5;
        const totalHalvings = Math.floor(totalBlocks / halvingInterval);
        const blocksUntilHalving = halvingInterval - (totalBlocks % halvingInterval);
        const currentEpoch = totalHalvings + 1;

        // Current block reward
        const baseReward = 3.125;
        const currentReward = baseReward / Math.pow(2, totalHalvings);

        return {
            totalBlocks,
            avgBlockTime: avgBlockTime.toFixed(1),
            highestZeros,
            fastestBlock: fastestBlock === Infinity ? '-' : fastestBlock.toFixed(1),
            slowestBlock: slowestBlock === 0 ? '-' : slowestBlock.toFixed(1),
            totalHalvings,
            blocksUntilHalving,
            currentEpoch,
            totalCoins: totalCoins.toFixed(4),
            currentReward: currentReward.toFixed(4)
        };
    }, [blocks, blocks?.length, blockchain, blockchain?.halvingEvent]);

    if (!stats) {
        return (
            <div className="fiori-card" style={{ marginTop: '16px' }}>
                <div className="fiori-card-header">
                    <h3>📊 Statistics</h3>
                </div>
                <div className="fiori-card-content text-muted text-center">
                    Mine some blocks to see statistics
                </div>
            </div>
        );
    }

    return (
        <div className="fiori-card" style={{ marginTop: '16px' }}>
            <div className="fiori-card-header">
                <h3>📊 Statistics</h3>
            </div>
            <div className="fiori-card-content">
                <div className="stats-grid">
                    <div className="stat-item" data-tooltip="Total number of blocks mined (excluding Genesis)">
                        <div className="stat-value">{stats.totalBlocks}</div>
                        <div className="stat-label">Total Blocks</div>
                    </div>
                    <div className="stat-item" data-tooltip="Average time between consecutive blocks">
                        <div className="stat-value">{stats.avgBlockTime}s</div>
                        <div className="stat-label">Avg Block Time</div>
                    </div>
                    <div className="stat-item" data-tooltip="Highest number of leading zeros achieved">
                        <div className="stat-value">{stats.highestZeros}</div>
                        <div className="stat-label">Most Zeros</div>
                    </div>
                    <div className="stat-item" data-tooltip="Shortest time to mine a single block">
                        <div className="stat-value">{stats.fastestBlock}s</div>
                        <div className="stat-label">Fastest Block</div>
                    </div>
                    <div className="stat-item" data-tooltip="Longest time to mine a single block">
                        <div className="stat-value">{stats.slowestBlock}s</div>
                        <div className="stat-label">Slowest Block</div>
                    </div>
                    <div className="stat-item" data-tooltip="Current coins awarded per mined block">
                        <div className="stat-value">{stats.currentReward}</div>
                        <div className="stat-label">Block Reward</div>
                    </div>
                </div>

                <div className="stats-divider"></div>

                <div className="stats-grid">
                    <div className="stat-item highlight" data-tooltip="Total coins created from all mining rewards">
                        <div className="stat-value">{stats.totalCoins}</div>
                        <div className="stat-label">Total Mined</div>
                    </div>
                    <div className="stat-item" data-tooltip="Current halving epoch (reward era)">
                        <div className="stat-value">Epoch {stats.currentEpoch}</div>
                        <div className="stat-label">Mining Era</div>
                    </div>
                    <div className="stat-item" data-tooltip="Number of times block reward has been halved">
                        <div className="stat-value">{stats.totalHalvings}</div>
                        <div className="stat-label">Halvings</div>
                    </div>
                    <div className="stat-item" data-tooltip="Blocks remaining until next reward halving">
                        <div className="stat-value">{stats.blocksUntilHalving}</div>
                        <div className="stat-label">Next Halving</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
