export function BlockCard({ block, index, isGenesis, isSelected, isValid, onClick }) {
    const truncateHash = (hash) => {
        if (!hash) return '';
        return `${hash.substring(0, 12)}...`;
    };

    const getLeadingZeros = (hash) => {
        const match = hash.match(/^0*/);
        return match ? match[0] : '';
    };

    return (
        <div
            className={`block-card ${isGenesis ? 'genesis' : ''} ${isSelected ? 'selected' : ''} ${!isValid ? 'invalid' : ''}`}
            onClick={onClick}
        >
            <div className="block-number">
                {isGenesis ? '🌟 Genesis' : `#${index}`}
            </div>

            <div className="block-hash">
                <span className="leading-zeros">{getLeadingZeros(block.hash)}</span>
                {block.hash.replace(/^0*/, '').substring(0, 8)}...
            </div>

            <div className="block-tx-count">
                <span>📄</span>
                <span>{block.transactions.length} tx{block.transactions.length !== 1 ? 's' : ''}</span>
            </div>

            {!isValid && (
                <div style={{
                    marginTop: '8px',
                    fontSize: '0.7rem',
                    color: 'var(--color-error)',
                    fontWeight: '500'
                }}>
                    ⚠️ Invalid
                </div>
            )}
        </div>
    );
}
