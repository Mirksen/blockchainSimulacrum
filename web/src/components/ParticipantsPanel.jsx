import { useState } from 'react';

export function ParticipantsPanel({ balances, participants }) {
    const [expandedKey, setExpandedKey] = useState(null);

    const truncateKey = (key) => {
        if (!key) return '';
        return `${key.substring(0, 8)}...${key.substring(key.length - 6)}`;
    };

    return (
        <div className="glass-card">
            <div className="glass-card-header">
                <h3>👥 Participants</h3>
                <span className="text-muted text-sm">{balances.length} wallets</span>
            </div>

            <div className="participants-list">
                {balances.map((participant, index) => (
                    <div
                        key={participant.publicKey}
                        className="participant-card animate-slideIn"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => setExpandedKey(
                            expandedKey === participant.publicKey ? null : participant.publicKey
                        )}
                    >
                        <div className="participant-avatar">
                            {participant.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="participant-info">
                            <div className="participant-name">
                                {participant.name}
                                {participant.isMiner && (
                                    <span className="miner-badge">⛏️ Miner</span>
                                )}
                            </div>
                            <div className="participant-balance">
                                {participant.balance.toFixed(8)} {' '}
                                <span className="text-bitcoin">LKC</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {expandedKey && (
                <div className="mt-md animate-fadeIn">
                    <div className="form-label">Public Key (Wallet Address)</div>
                    <div className="mining-hash text-xs" style={{ wordBreak: 'break-all' }}>
                        {participants.find(p => p.publicKey === expandedKey)?.publicKey}
                    </div>
                </div>
            )}
        </div>
    );
}
