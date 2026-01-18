import { useState } from 'react';
import { MiningVisualizer } from './MiningVisualizer';

export function MiningCard({ isMining, miningProgress, difficulty, hashAttempts }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const cardStyle = isExpanded ? {
        position: 'absolute',
        width: '300%',
        zIndex: 100,
        boxShadow: 'var(--sapContent_Shadow3)',
        left: 0,
        top: 0
    } : {
        position: 'relative',
        width: '100%',
        transition: 'all var(--sapTransition)'
    };

    // When expanded, we might want to pass a prop to Visualizer to show full hash?
    // The user said "to show more information like the full hash length".
    // I can pass `showFullHash={isExpanded}` to MiningVisualizer?
    // I'll need to check if MiningVisualizer supports it or I need to modify it. 
    // For now I'll create this card.

    return (
        <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div className="fiori-card" style={cardStyle}>
                <div className="fiori-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>⛏️ Mining</h3>
                    <button
                        className="btn btn-transparent"
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? "Collapse" : "Expand View"}
                    >
                        {isExpanded ? '⤢' : '⤢'}
                    </button>
                </div>
                <div className="fiori-card-content">
                    <MiningVisualizer
                        isMining={isMining}
                        progress={miningProgress}
                        difficulty={difficulty}
                        hashAttempts={hashAttempts}
                        showFullHash={isExpanded}
                    />
                </div>
            </div>
            {/* Spacer to prevent layout jump if absolute */}
            {isExpanded && <div style={{ height: '300px' }}></div>}
        </div>
    );
}
