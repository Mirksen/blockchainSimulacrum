import { useRef, useEffect } from 'react';

export function MiningVisualizer({ isMining, progress, difficulty, hashAttempts = [], showFullHash = false }) {
    const logRef = useRef(null);

    // Auto-scroll hash attempts log to bottom
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [hashAttempts]);

    if (!progress) return null;

    const getLeadingZeros = (hash) => {
        const match = hash?.match(/^0*/);
        return match ? match[0].length : 0;
    };

    const currentZeros = getLeadingZeros(progress.hash);
    const progressPercent = Math.min((currentZeros / difficulty) * 100, 99);

    return (
        <div className="mining-panel mining-active animate-fadeIn">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--sapBrandColor)' }}>
                    <span className={isMining ? "animate-pulse" : ""}>⛏️</span>
                    {isMining ? "Mining in Progress..." : "Last Mining Result"}
                </h4>
                <span className="text-muted text-small">
                    Target: {difficulty} leading zeros
                </span>
            </div>

            <div className="progress-bar">
                <div
                    className="progress-fill"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            <div className="form-label mt-md">Current Hash Attempt</div>
            <div className="mining-hash">
                <span className="leading-zeros">
                    {progress.hash?.match(/^0*/)?.[0] || ''}
                </span>
                <span style={{ opacity: 0.7 }}>
                    {progress.hash?.replace(/^0*/, '') || ''}
                </span>
            </div>

            {/* Row 1: Nonce and Elapsed */}
            <div className="mining-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="mining-stat" data-tooltip="Number of hash attempts tried">
                    <div className="mining-stat-value animate-pulse">
                        {progress.nonce?.toLocaleString()}
                    </div>
                    <div className="mining-stat-label">Nonce</div>
                </div>
                <div className="mining-stat" data-tooltip="Time spent mining this block">
                    <div className="mining-stat-value">
                        {(progress.elapsedMs / 1000).toFixed(1)}s
                    </div>
                    <div className="mining-stat-label">Elapsed</div>
                </div>
            </div>

            {/* Row 2: H/s and Zeros */}
            <div className="mining-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: '8px' }}>
                <div className="mining-stat" data-tooltip="Hash computations per second">
                    <div className="mining-stat-value">
                        {Math.round(progress.iterations / (progress.elapsedMs / 1000) || 0).toLocaleString()}
                    </div>
                    <div className="mining-stat-label">H/s</div>
                </div>
                <div className="mining-stat" data-tooltip="Current leading zeros vs target required">
                    <div className="mining-stat-value" style={{ color: currentZeros >= difficulty ? 'var(--sapPositiveColor)' : 'inherit' }}>
                        {currentZeros}/{difficulty}
                    </div>
                    <div className="mining-stat-label">Zeros</div>
                </div>
            </div>

            {/* Hash Attempts Log */}
            <div>
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
                            return (
                                <div key={index} className="hash-attempt">
                                    <span className="hash-attempt-nonce">#{attempt.nonce}</span>
                                    <span className="hash-attempt-hash">
                                        <span className="leading-zeros">{leadingZeros}</span>
                                        {showFullHash ? restOfHash : `${restOfHash.substring(0, 24)}...`}
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
