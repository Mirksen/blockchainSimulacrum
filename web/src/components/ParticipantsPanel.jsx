import { useState } from 'react';

export function ParticipantsPanel({ balances, participants, coinName = 'powCoin' }) {
    const [expandedKey, setExpandedKey] = useState(null);

    return (
        <div className="fiori-card">
            <div className="fiori-card-header">
                <h3>👥 Participants</h3>
                <span className="text-muted text-small">{balances.length} wallets</span>
            </div>

            <div className="fiori-card-content" style={{ padding: 0 }}>
                {balances.map((participant, index) => (
                    <div
                        key={participant.publicKey}
                        className="list-item animate-fadeIn"
                        style={{ animationDelay: `${index * 50}ms`, cursor: 'pointer' }}
                        onClick={() => setExpandedKey(
                            expandedKey === participant.publicKey ? null : participant.publicKey
                        )}
                    >
                        <div className="list-item-avatar">
                            {participant.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="list-item-content">
                            <div className="list-item-title">
                                {participant.name}
                                {participant.isMiner && (
                                    <span className="miner-badge">⛏️ Miner</span>
                                )}
                            </div>
                            <div className="list-item-subtitle">
                                {participant.balance.toFixed(8)} {coinName}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {expandedKey && (
                <div className="fiori-card-content animate-fadeIn" style={{ borderTop: '1px solid var(--sapList_BorderColor)' }}>
                    <div className="form-label">Public Key (Wallet Address)</div>
                    <div className="mining-hash">
                        {participants.find(p => p.publicKey === expandedKey)?.publicKey}
                    </div>
                </div>
            )}
        </div>
    );
}
