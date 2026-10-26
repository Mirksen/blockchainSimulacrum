import { useState } from 'react';
import { MiningVisualizer } from './MiningVisualizer';

export function MiningCard({ isMining, miningProgress, minerProgress, raceWinner, difficulty, hashAttempts }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const cardStyle = isExpanded ? {
        position: 'absolute',
        width: 'min(900px, calc(100vw - 48px))',
        zIndex: 100,
        boxShadow: 'var(--sapContent_Shadow3)',
        left: 0,
        top: 0
    } : {
        position: 'relative',
        width: '100%',
        transition: 'all var(--sapTransition)'
    };

    return (
        <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div className="fiori-card" style={cardStyle}>
                <div className="fiori-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>⛏️ Mining Race</h3>
                    <button
                        className="btn btn-transparent"
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? "Collapse mining race" : "Expand mining race"}
                        aria-label={isExpanded ? "Collapse mining race" : "Expand mining race"}
                        aria-expanded={isExpanded}
                    >
                        {isExpanded ? '⤢' : '⤢'}
                    </button>
                </div>
                <div className="fiori-card-content">
                    {!miningProgress && Object.keys(minerProgress).length === 0 && <p className="text-muted">Mine a block to watch the miners race.</p>}
                    <MiningVisualizer
                        isMining={isMining}
                        progress={miningProgress}
                        minerProgress={minerProgress}
                        raceWinner={raceWinner}
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
