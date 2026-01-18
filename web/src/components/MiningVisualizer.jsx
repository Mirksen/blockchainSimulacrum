export function MiningVisualizer({ isMining, progress, difficulty }) {
    if (!isMining || !progress) return null;

    const getLeadingZeros = (hash) => {
        const match = hash?.match(/^0*/);
        return match ? match[0].length : 0;
    };

    const currentZeros = getLeadingZeros(progress.hash);
    const progressPercent = Math.min((currentZeros / difficulty) * 100, 99);

    return (
        <div className="mining-visualizer mining-active animate-fadeIn">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="animate-pulse">⛏️</span>
                    Mining in Progress...
                </h4>
                <span className="text-muted text-sm">
                    Target: {difficulty} leading zeros
                </span>
            </div>

            <div className="progress-bar">
                <div
                    className="progress-fill"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            <div className="form-label" style={{ marginTop: 'var(--space-md)' }}>Current Hash Attempt</div>
            <div className="mining-hash">
                <span style={{ color: 'var(--color-success)', fontWeight: '600' }}>
                    {progress.hash?.match(/^0*/)?.[0] || ''}
                </span>
                <span style={{ opacity: 0.7 }}>
                    {progress.hash?.replace(/^0*/, '') || ''}
                </span>
            </div>

            <div className="mining-stats">
                <div className="mining-stat">
                    <div className="mining-stat-value animate-pulse">
                        {progress.nonce?.toLocaleString()}
                    </div>
                    <div className="mining-stat-label">Nonce</div>
                </div>
                <div className="mining-stat">
                    <div className="mining-stat-value">
                        {(progress.elapsedMs / 1000).toFixed(1)}s
                    </div>
                    <div className="mining-stat-label">Elapsed</div>
                </div>
                <div className="mining-stat">
                    <div className="mining-stat-value">
                        {Math.round(progress.iterations / (progress.elapsedMs / 1000) || 0).toLocaleString()}
                    </div>
                    <div className="mining-stat-label">H/s</div>
                </div>
                <div className="mining-stat">
                    <div className="mining-stat-value" style={{ color: currentZeros >= difficulty ? 'var(--color-success)' : 'inherit' }}>
                        {currentZeros}/{difficulty}
                    </div>
                    <div className="mining-stat-label">Zeros Found</div>
                </div>
            </div>
        </div>
    );
}
