export function BlockCard({ block, index, isGenesis, isSelected, isLatest, isValid, onClick, elapsedTime }) {
    const getLeadingZeros = (hash) => {
        const match = hash?.match(/^0*/);
        return match ? match[0] : '';
    };

    const leadingZeros = getLeadingZeros(block.hash);
    const restOfHash = block.hash?.replace(/^0*/, '') || '';

    // Format elapsed time
    const formatTime = (ms) => {
        if (ms === null || ms === undefined) return '';
        const seconds = (ms / 1000).toFixed(1);
        return `${seconds}s`;
    };

    const className = [
        'block-card',
        isGenesis && 'genesis',
        isSelected && 'selected',
        isLatest && 'latest',
        !isValid && 'invalid'
    ].filter(Boolean).join(' ');

    return (
        <div className={className} onClick={onClick}>
            <div className="block-number" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{isGenesis ? '🌟 Genesis' : `Block #${index}`}</span>
                {elapsedTime !== null && elapsedTime !== undefined && (
                    <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--sapContent_LabelColor)' }}>
                        ⏱️ {formatTime(elapsedTime)}
                    </span>
                )}
            </div>
            <div className="block-hash">
                <span className="leading-zeros">{leadingZeros}</span>
                {restOfHash}
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--sapContent_LabelColor)' }}>
                {block.transactions?.length || 0} transactions
            </div>
            {!isValid && (
                <div className="status-negative mt-sm" style={{ fontSize: '10px' }}>
                    ⚠️ Invalid
                </div>
            )}
        </div>
    );
}
