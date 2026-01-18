import { useState } from 'react';

export function TransactionForm({ participants, onCreateTransaction, disabled }) {
    const [sender, setSender] = useState('');
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [reference, setReference] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!sender || !recipient || !amount) {
            setError('Please fill in all required fields');
            return;
        }

        if (sender === recipient) {
            setError('Sender and recipient must be different');
            return;
        }

        if (parseFloat(amount) <= 0) {
            setError('Amount must be greater than 0');
            return;
        }

        const result = onCreateTransaction(
            sender,
            recipient,
            amount,
            0.00000001,
            reference || `TX-${Date.now()}`
        );

        if (result.success) {
            setSuccess(`Transaction added to mempool!`);
            setAmount('');
            setReference('');
            setTimeout(() => setSuccess(''), 3000);
        } else {
            setError(result.error);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="form-group">
                <label className="form-label">From</label>
                <select
                    className="form-select"
                    value={sender}
                    onChange={(e) => setSender(e.target.value)}
                    disabled={disabled}
                >
                    <option value="">Select sender...</option>
                    {participants.map(p => (
                        <option key={p.publicKey} value={p.name}>{p.name}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">To</label>
                <select
                    className="form-select"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    disabled={disabled}
                >
                    <option value="">Select recipient...</option>
                    {participants.map(p => (
                        <option key={p.publicKey} value={p.name}>{p.name}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Amount (LKC)</label>
                <input
                    type="number"
                    className="form-input"
                    placeholder="0.00000000"
                    step="0.00000001"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={disabled}
                />
            </div>

            <div className="form-group">
                <label className="form-label">Reference (optional)</label>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Payment for..."
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={disabled}
                />
            </div>

            {error && (
                <div className="validation-status validation-invalid mb-md" style={{ fontSize: '0.75rem' }}>
                    ⚠️ {error}
                </div>
            )}

            {success && (
                <div className="validation-status validation-valid mb-md" style={{ fontSize: '0.75rem' }}>
                    ✓ {success}
                </div>
            )}

            <button
                type="submit"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                disabled={disabled}
            >
                ➕ Add to Mempool
            </button>
        </form>
    );
}
