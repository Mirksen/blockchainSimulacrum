import { useState } from 'react';
import { CreateNameForm } from './CreateNameForm';
import './cardKit.css';
import './WalletsCard.css';
import { colorOf } from './minerColors';

// Wallets card (web/DESIGN.md, "Card grid").
// wallets: [{ name, balance, isMiner?, blocksWon?, hashrate? }]  hashrate in H/s, shown for miners
// onCreateWallet(name) returns { success, error }; the error text is shown under the field.

const PlusIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" /></svg>
);

function Avatar({ name, colorKey }) {
  const color = colorOf(colorKey ?? name);
  const style = color ? { '--av-color': color } : undefined;
  return <span className={`card-kit-av${style ? '' : ' is-plain'}`} style={style} aria-hidden="true">{String(name).charAt(0).toUpperCase()}</span>;
}

function balanceText(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(8) : String(value ?? '');
}

export function WalletsCard({ wallets = [], coinName = 'powfyicoin', onOpenWallet, onCreateWallet }) {
  const [creating, setCreating] = useState(false);
  return (
    <section className="card-kit wallets-card" aria-label="Wallets">
      <div className="card-kit-head">
        <h2 className="card-kit-title">Wallets</h2>
        <span className="card-kit-aside wallets-card-aside">{wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'} · {coinName} · virtual</span>
        <button type="button" className="wallets-card-new" aria-expanded={creating} onClick={() => setCreating(open => !open)}><PlusIcon />Create wallet</button>
      </div>
      <ul className="wallets-card-list" aria-label="Wallets">
        {wallets.length === 0 && <li className="card-kit-empty">No wallets yet.<small>Create one below.</small></li>}
        {wallets.map(wallet => (
          <li key={wallet.name}>
            <button type="button" className="wallets-card-row" onClick={() => onOpenWallet?.(wallet.name)}
              aria-label={`Open ${wallet.name}, balance ${balanceText(wallet.balance)} ${coinName}`}>
              <Avatar name={wallet.name} colorKey={wallet.colorKey} />
              <span className="wallets-card-nm">{wallet.name}</span>
              <span className="wallets-card-role">{wallet.isMiner ? `miner · ${wallet.blocksWon ?? 0} ${(wallet.blocksWon ?? 0) === 1 ? 'block' : 'blocks'}` : ''}</span>
              <span className="wallets-card-hp">{wallet.isMiner && wallet.hashrate != null ? `${Math.round(wallet.hashrate).toLocaleString('en-US')} H/s` : ''}</span>
              <span className="wallets-card-bal">{balanceText(wallet.balance)}</span>
            </button>
          </li>
        ))}
      </ul>
      {creating && <div className="wallets-card-create">
        <CreateNameForm noun="wallet" label="Wallet name" placeholder="Wallet name, e.g. Dana" hint="Starts at 0. 2–16 letters or digits."
          onCreate={onCreateWallet} onCancel={() => setCreating(false)} />
      </div>}
    </section>
  );
}
