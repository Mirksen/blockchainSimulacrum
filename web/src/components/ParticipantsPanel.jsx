import { useState, useRef, useEffect } from 'react';
import { ParticipantDetailsModal } from './ParticipantDetailsModal';

export function ParticipantsPanel({
    balances,
    participants,
    blocks = [],
    coinName = 'powCoin',
    toggleMiner,
    setMinerHashpower,
    isMining
}) {
    const [selectedParticipantKey, setSelectedParticipantKey] = useState(null);
    const [animatingWallets, setAnimatingWallets] = useState(new Set());
    const [gainAmounts, setGainAmounts] = useState({});
    const prevBalancesRef = useRef({});

    // Track balance changes and trigger animations
    useEffect(() => {
        const newAnimating = new Set();
        const newGains = {};

        balances.forEach(balance => {
            const prevBalance = prevBalancesRef.current[balance.publicKey];
            const currentBalance = balance.balance;

            // If balance increased, trigger animation (including first-time receives)
            if (prevBalance !== undefined && currentBalance > prevBalance) {
                newAnimating.add(balance.publicKey);
                newGains[balance.publicKey] = (currentBalance - prevBalance).toFixed(4);
            }
        });

        if (newAnimating.size > 0) {
            setAnimatingWallets(newAnimating);
            setGainAmounts(newGains);

            // Clear animation after completion
            setTimeout(() => {
                setAnimatingWallets(new Set());
                setGainAmounts({});
            }, 1500);
        }

        // Update previous balances
        const newPrev = {};
        balances.forEach(b => {
            newPrev[b.publicKey] = b.balance;
        });
        prevBalancesRef.current = newPrev;
    }, [balances]);

    const getMinerColorClass = (name) => {
        return name.toLowerCase() === 'minas' ? 'minas' : 'lars';
    };

    const getParticipantData = (publicKey) => {
        return participants.find(p => p.publicKey === publicKey);
    };

    const selectedParticipant = selectedParticipantKey
        ? participants.find(p => p.publicKey === selectedParticipantKey)
        : null;
    const selectedBalance = selectedParticipantKey
        ? balances.find(b => b.publicKey === selectedParticipantKey)
        : null;

    return (
        <div className="fiori-card">
            <div className="fiori-card-header">
                <h3>👥 Participants</h3>
                <span className="text-muted text-small">{balances.length} wallets</span>
            </div>

            <div className="fiori-card-content" style={{ padding: 0 }}>
                {balances.map((balance, index) => {
                    const participant = getParticipantData(balance.publicKey);
                    const isMiner = participant?.isMiner;
                    const minerEnabled = participant?.minerEnabled ?? true;
                    const blocksWon = participant?.blocksWon || 0;
                    const colorClass = isMiner ? getMinerColorClass(balance.name) : '';
                    const isAnimating = animatingWallets.has(balance.publicKey);
                    const gainAmount = gainAmounts[balance.publicKey];

                    return (
                        <div
                            key={balance.publicKey}
                            className={`list-item animate-fadeIn ${isMiner ? `miner-${colorClass}-border` : ''} ${isAnimating ? 'wallet-coin-gain' : ''}`}
                            style={{
                                animationDelay: `${index * 50}ms`,
                                cursor: 'pointer',
                                background: isMiner ? `var(--miner-${colorClass}-bg)` : 'transparent',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            onClick={() => setSelectedParticipantKey(balance.publicKey)}
                        >
                            {/* Coin Gain Animation Overlay */}
                            {isAnimating && (
                                <div className="coin-gain-overlay">
                                    <div className="coin-particles">
                                        <span className="coin-particle">💰</span>
                                        <span className="coin-particle">💰</span>
                                        <span className="coin-particle">💰</span>
                                        <span className="coin-particle">🪙</span>
                                        <span className="coin-particle">🪙</span>
                                    </div>
                                    <div className="coin-gain-amount">+{gainAmount}</div>
                                </div>
                            )}

                            <div className="list-item-avatar" style={{
                                background: isMiner ? `var(--miner-${colorClass}-color)` : undefined,
                                color: isMiner ? 'white' : undefined
                            }}>
                                {isMiner ? '⛏️' : balance.name.charAt(0).toUpperCase()}
                            </div>

                            <div className="list-item-content">
                                <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: isMiner ? `var(--miner-${colorClass}-color)` : 'inherit' }}>
                                        {balance.name}
                                    </span>
                                    {isMiner && (
                                        <>
                                            <span className={`winner-badge ${colorClass}`}>
                                                🏆 {blocksWon}
                                            </span>
                                            {!minerEnabled && (
                                                <span className="status-badge status-negative" style={{ fontSize: '9px', padding: '1px 4px' }}>
                                                    OFF
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div className={`list-item-subtitle ${isAnimating ? 'balance-updating' : ''}`}>
                                    {balance.balance.toFixed(8)} {coinName}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Participant Details Modal */}
            {selectedParticipant && (
                <ParticipantDetailsModal
                    participant={selectedParticipant}
                    balance={selectedBalance}
                    blocks={blocks}
                    onClose={() => setSelectedParticipantKey(null)}
                    toggleMiner={toggleMiner}
                    setMinerHashpower={setMinerHashpower}
                    isMining={isMining}
                    coinName={coinName}
                />
            )}
        </div>
    );
}
