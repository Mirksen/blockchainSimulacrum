import { Modal } from './Modal';

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

const OUTPUT_KINDS = { payment: 'Payment', change: 'Change', memo: 'Memo', reward: 'Reward' };
const shortId = id => `${id.slice(0, 8)}…${id.slice(-4)}`;
const shortAddress = address => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null);
const coins = value => value.toFixed(8);

function InputRow({ input }) {
    return (
        <li className="details-modal-coin is-flow">
            <div className="details-modal-flow-main">
                <b>{input.owner ?? 'Unknown'}</b>
                {input.value !== null
                    ? <span className="details-modal-row-amount">{coins(input.value)}</span>
                    : <span className="details-modal-flow-missing">output no longer exists</span>}
            </div>
            <div className="details-modal-flow-meta" title={`${input.txid}:${input.vout}`}>
                {shortId(input.txid)}:{input.vout}{input.blockIndex !== null ? ` · block #${input.blockIndex}` : input.value !== null ? ' · pending' : ''}
            </div>
        </li>
    );
}

function OutputRow({ output }) {
    const state = output.kind === 'memo' ? 'data only, cannot be spent'
        : output.spent ? (output.spentIn === null ? 'spent in the mempool' : `spent in block #${output.spentIn}`) : 'unspent';
    return (
        <li className="details-modal-coin is-flow">
            <div className="details-modal-flow-main">
                <span className="details-modal-pill">{OUTPUT_KINDS[output.kind]}</span>
                <b>{output.kind === 'memo' ? output.memo : (output.owner ?? 'Unknown')}</b>
                <span className="details-modal-row-amount">{coins(output.value)}</span>
            </div>
            <div className="details-modal-flow-meta">{[shortAddress(output.address), state].filter(Boolean).join(' · ')}</div>
        </li>
    );
}

function ScriptRow({ label, asm }) {
    return (
        <div className="details-modal-script">
            <div className="details-modal-label">{label}</div>
            <div className="details-modal-hash is-small"><code>{asm || '(empty)'}</code></div>
        </div>
    );
}

// transaction: the view of describeTransaction (lib/tx/describe.js); blockIndex is null while pending.
export function TransactionDetailsModal({ transaction, blockIndex, onClose, coinName = 'powfyicoin' }) {
    if (!transaction) return null;
    const { coinbase, inputs, outputs, fee, signed } = transaction;
    const signature = coinbase ? { text: 'No signature: a coinbase creates coins', short: 'None', tone: '' }
        : signed ? { text: 'Every input passes its script', short: 'Valid', tone: 'is-ok' }
            : { text: 'An input fails its script or its coin is gone', short: 'Invalid', tone: 'is-err' };
    const inputTotal = inputs.reduce((sum, input) => sum + (input.value ?? 0), 0);
    const outputTotal = outputs.reduce((sum, output) => sum + output.value, 0);

    return (
        <Modal onClose={onClose} label="Transaction details">
            <div className="details-modal transaction-details-modal" onClick={e => e.stopPropagation()}>
                <div className="details-modal-head">
                    <h2 className="details-modal-title">{coinbase ? 'Mining reward' : 'Transaction details'}</h2>
                    <button type="button" className="details-modal-close" aria-label="Close details" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="details-modal-body">
                    <div className="details-modal-amount">
                        <div className="details-modal-amount-value">{coins(transaction.amount)}</div>
                        <div className="details-modal-amount-label">{coinbase ? `${coinName} to ${transaction.to}` : `${coinName} from ${transaction.from} to ${transaction.to}`}</div>
                    </div>

                    <div className="details-modal-flow">
                        <div className="details-modal-flow-side">
                            <div className="details-modal-label">Inputs ({coinbase ? 0 : inputs.length})</div>
                            {coinbase
                                ? <div className="details-modal-empty is-small">Coinbase: new coins, no input spent</div>
                                : <ul className="details-modal-coins" aria-label="Inputs">{inputs.map((input, index) => <InputRow key={index} input={input} />)}</ul>}
                        </div>
                        <div className="details-modal-flow-side">
                            <div className="details-modal-label">Outputs ({outputs.length})</div>
                            <ul className="details-modal-coins" aria-label="Outputs">{outputs.map(output => <OutputRow key={output.index} output={output} />)}</ul>
                        </div>
                    </div>

                    {!coinbase && fee !== null && (
                        <div className="details-modal-fee" role="group" aria-label="Fee">
                            <span>Fee = inputs − outputs</span>
                            <span className="details-modal-row-amount">{coins(inputTotal)} − {coins(outputTotal)} = {coins(fee)}</span>
                        </div>
                    )}

                    <div className="details-modal-section">
                        <div className="details-modal-label">Transaction ID (TXID)</div>
                        <div className="details-modal-hash">{transaction.txid}</div>
                        <p className="details-modal-note">Double SHA-256 of the raw bytes below, displayed byte-reversed.</p>
                    </div>

                    <div className="details-modal-section">
                        <div className="details-modal-label">Signature</div>
                        <div className={`details-modal-sig ${signature.tone}`}>{signature.text}</div>
                    </div>

                    <details className="details-modal-more">
                        <summary>Scripts</summary>
                        {coinbase && <ScriptRow label="Coinbase scriptSig" asm={transaction.coinbaseScriptAsm} />}
                        {inputs.map((input, index) => (
                            <div key={index}>
                                <ScriptRow label={`Input ${index} scriptSig`} asm={input.scriptAsm} />
                                {input.lockAsm && <ScriptRow label={`Input ${index} locked by`} asm={input.lockAsm} />}
                            </div>
                        ))}
                        {outputs.map(output => <ScriptRow key={output.index} label={`Output ${output.index} scriptPubKey`} asm={output.scriptAsm} />)}
                    </details>

                    <details className="details-modal-more">
                        <summary>Raw bytes ({transaction.size} bytes)</summary>
                        <div className="details-modal-hash is-small"><code>{transaction.hex}</code></div>
                    </details>

                    <div className="details-modal-stats">
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">{blockIndex === null || blockIndex === undefined ? 'Mempool' : `#${blockIndex}`}</div>
                            <div className="details-modal-stat-label">Block</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">{transaction.size}</div>
                            <div className="details-modal-stat-label">Bytes</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className="details-modal-stat-value">{coinbase || fee === null ? 'N/A' : coins(fee)}</div>
                            <div className="details-modal-stat-label">Fee</div>
                        </div>
                        <div className="details-modal-stat">
                            <div className={`details-modal-stat-value is-ui ${signature.tone}`}>{signature.short}</div>
                            <div className="details-modal-stat-label">Signature</div>
                        </div>
                    </div>

                    <div className="details-modal-info">
                        <div className="details-modal-info-title">How transactions work</div>
                        <ul>
                            <li>An <strong>input</strong> spends one whole earlier output; the wallet picks which coins</li>
                            <li>What the payment does not use comes back as <strong>change</strong>, a new output to the sender</li>
                            <li>The <strong>fee</strong> is never written down: it is what inputs leave over, and the miner collects it</li>
                            <li>The <strong>signature</strong> covers the outputs, so changing an amount breaks it</li>
                            <li>The <strong>TXID</strong> is a hash of these bytes: a changed transaction has a new id, and spends of its old id point at nothing</li>
                        </ul>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
