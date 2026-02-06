import { useRef, useEffect } from 'react';

export function MiningVisualizer({
    isMining,
    progress,
    minerProgress = {},
    raceWinner,
    difficulty,
    hashAttempts = [],
    showFullHash = false
}) {
    const logRef = useRef(null);

    // Auto-scroll hash attempts log to bottom
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [hashAttempts]);

    if (!progress && Object.keys(minerProgress).length === 0) return null;

    const getLeadingZeros = (hash) => {
        const match = hash?.match(/^0*/);
        return match ? match[0].length : 0;
    };

    // Find the leading miner (most zeros)
    const miners = Object.entries(minerProgress);
    const leadingMiner = miners.reduce((max, [name, data]) => {
        if (!max || (data.zeros || 0) > (max.zeros || 0)) {
            return { name, zeros: data.zeros || 0 };
        }
        return max;
    }, null);

    const getMinerColorClass = (name) => {
        return name.toLowerCase() === 'minas' ? 'minas' : 'lars';
    };

    // Calculate H/s per miner
    const getMinerHashRate = (data) => {
        if (!data || !data.elapsedMs || data.elapsedMs === 0) return 0;
        return Math.round((data.iterations || 0) / (data.elapsedMs / 1000));
    };

    return (
        <div className="mining-panel mining-active animate-fadeIn">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--sapBrandColor)' }}>
                    <span className={isMining ? "animate-pulse" : ""}>⛏️</span>
                    {isMining ? "Mining Race in Progress..." : raceWinner ? `🏆 ${raceWinner} Won!` : "Last Mining Result"}
                </h4>
                <span className="text-muted text-small">
                    Target: {difficulty} zeros
                </span>
            </div>

            {/* Racing Lanes */}
            {miners.length > 0 && (
                <div className="miner-race-container">
                    {miners.map(([minerName, data]) => {
                        const colorClass = getMinerColorClass(minerName);
                        const isLeading = leadingMiner?.name === minerName && isMining;
                        const isWinner = raceWinner === minerName;
                        const hashRate = getMinerHashRate(data);

                        return (
                            <div
                                key={minerName}
                                className={`miner-race-lane ${colorClass} ${isLeading ? 'leading' : ''} ${isWinner ? 'miner-winner' : ''}`}
                            >
                                <div className="miner-lane-header">
                                    <div className="miner-name">
                                        ⛏️ {minerName}
                                        {isWinner && <span style={{ marginLeft: '4px' }}>🏆</span>}
                                    </div>
                                    <div className="miner-hashrate">
                                        {hashRate.toLocaleString()} H/s
                                    </div>
                                </div>
                                <div className="miner-race-stats">
                                    <div className="miner-race-stat-row">
                                        <span className="miner-stat-label">Nonce</span>
                                        <span className="miner-race-stat-value">{(data.nonce || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="miner-race-stat-row">
                                        <span className="miner-stat-label">Zeros</span>
                                        <span className="miner-race-stat-value" style={{
                                            color: (data.zeros || 0) >= difficulty ? 'var(--sapPositiveColor)' : 'inherit'
                                        }}>
                                            {data.zeros || 0}/{difficulty}
                                        </span>
                                    </div>
                                    <div>
                                        <div className="miner-stat-label">Hash</div>
                                        <div className="miner-race-stat-value miner-hash-value">
                                            <span className="leading-zeros">
                                                {data.hash?.match(/^0*/)?.[0] || ''}
                                            </span>
                                            {data.hash?.replace(/^0*/, '').substring(0, 16) || '...'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Overall Progress Bar */}
            {progress && (
                <>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${Math.min((getLeadingZeros(progress.hash) / difficulty) * 100, 99)}%` }}
                        />
                    </div>

                    {/* Summary Stats Row - Full width below race lanes */}
                    <div className="mining-summary-row">
                        <div className="mining-summary-stat">
                            <span className="mining-summary-label">Total Attempts:</span>
                            <span className="mining-summary-value">{progress.iterations?.toLocaleString() || 0}</span>
                        </div>
                        <div className="mining-summary-stat">
                            <span className="mining-summary-label">Elapsed:</span>
                            <span className="mining-summary-value">{((progress.elapsedMs || 0) / 1000).toFixed(1)}s</span>
                        </div>
                        <div className="mining-summary-stat">
                            <span className="mining-summary-label">Combined H/s:</span>
                            <span className="mining-summary-value">{Math.round((progress.iterations || 0) / ((progress.elapsedMs || 1) / 1000)).toLocaleString()}</span>
                        </div>
                    </div>
                </>
            )}

            {/* Hash Attempts Log */}
            <div style={{ marginTop: '12px' }}>
                <div className="form-label">Failed Hash Attempts</div>
                <div className="hash-attempts-log" ref={logRef}>
                    {hashAttempts.length === 0 ? (
                        <div style={{ color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>
                            Searching for valid hash...
                        </div>
                    ) : (
                        hashAttempts.map((attempt, index) => {
                            const leadingZeros = attempt.hash.match(/^0*/)?.[0] || '';
                            const restOfHash = attempt.hash.replace(/^0*/, '');
                            const minerColor = attempt.miner?.toLowerCase() === 'minas'
                                ? 'var(--miner-minas-color)'
                                : 'var(--miner-chris-color)';
                            return (
                                <div key={index} className="hash-attempt">
                                    <span className="hash-attempt-miner" style={{ color: minerColor }}>
                                        {attempt.miner?.substring(0, 1) || '?'}
                                    </span>
                                    <span className="hash-attempt-nonce">#{attempt.nonce}</span>
                                    <span className="hash-attempt-hash">
                                        <span className="leading-zeros">{leadingZeros}</span>
                                        {showFullHash ? restOfHash : `${restOfHash.substring(0, 16)}...`}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
