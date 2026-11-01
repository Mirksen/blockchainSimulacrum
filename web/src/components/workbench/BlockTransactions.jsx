import { useState } from 'react';
import './cardKit.css';
import './BlockTransactions.css';

// The transactions of the shown block, a part of its card (web/DESIGN.md, "Card grid").
// One line each; a click opens one in place.
// transactions:  describeTx() views of the block, in block order
// editedTx:      indices of transactions changed after mining
// onOpenDetails(view) opens scripts, raw bytes and the explanation of one transaction

const coins = value => (Number.isFinite(value) ? value.toFixed(8) : '');
const trimmed = value => {
  const [whole, fraction = ''] = value.toFixed(8).replace(/0+$/, '').split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
};
const coinCount = count => `${count} ${count === 1 ? 'coin' : 'coins'}`;

function summary(tx) {
  if (tx.coinbase) return tx.memo ?? 'new coins';
  const parts = [coinCount(tx.inputs.length)];
  if (tx.change > 0) parts.push(`${trimmed(tx.change)} change`);
  if (tx.fee != null) parts.push(`${trimmed(tx.fee)} fee`);
  return parts.join(' · ');
}

function Flow({ tx }) {
  return (
    <div className="block-tx-flow">
      <div className="block-tx-side">
        <span className="block-tx-label">In</span>
        {tx.coinbase
          ? <span className="block-tx-coin"><span>Coinbase · new coins</span></span>
          : tx.inputs.map((input, i) => (
            <span key={i} className="block-tx-coin"><span>{input.owner ?? 'Unknown'}{input.blockIndex != null ? ` · from #${input.blockIndex}` : ''}</span><b>{input.value == null ? 'gone' : coins(input.value)}</b></span>
          ))}
      </div>
      <div className="block-tx-side">
        <span className="block-tx-label">Out</span>
        {tx.outputs.map(output => (
          <span key={output.index} className="block-tx-coin">
            <span>{output.kind === 'memo' ? 'Memo' : output.owner ?? 'Unknown'}{output.kind === 'change' ? ' · change' : ''}{output.spent ? ` · spent${output.spentIn != null ? ` in #${output.spentIn}` : ''}` : ''}</span>
            <b>{coins(output.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BlockTransactions({ transactions = [], onOpenDetails, editedTx = [] }) {
  const [openId, setOpenId] = useState(null);
  return (
    <section className="block-tx" aria-label="Transactions">
      <div className="block-tx-head">
        <h3 className="card-kit-title">Transactions</h3>
        <span className="card-kit-pill is-none">{transactions.length}</span>
      </div>
      <ul className="block-tx-list" aria-label="Transactions">
        {transactions.map((tx, i) => {
          const open = openId === i;
          const edited = editedTx.includes(i);
          return (
            <li key={i} className={`block-tx-item${open ? ' is-open' : ''}${edited ? ' is-edited' : ''}`}>
              <button type="button" className="block-tx-row" aria-expanded={open} onClick={() => setOpenId(open ? null : i)}>
                <b>{tx.coinbase ? 'Coinbase' : tx.from} → {tx.to}</b>
                <small>{edited ? 'edited after mining' : summary(tx)}</small>
                <span className="block-tx-amt">{trimmed(tx.amount)}</span>
              </button>
              {open && (
                <div className="block-tx-detail">
                  <Flow tx={tx} />
                  <div className="block-tx-id"><span className="block-tx-label">TXID</span><code>{tx.txid}</code></div>
                  <button type="button" className="block-tx-more" onClick={() => onOpenDetails?.(tx)}>Scripts, signature and raw bytes</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
