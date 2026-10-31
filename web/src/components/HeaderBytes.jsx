import { headerFields } from '../../../shared/bitcoin-block.mjs';
import { CopyButton } from './workbench/ChainBand';
import './HeaderBytes.css';

const LABELS = { version: 'Version', previousHash: 'Previous hash', merkleRoot: 'Merkle root', time: 'Time', bits: 'Bits', nonce: 'Nonce' };

function valueOf({ name, value }) {
  if (name === 'time') return `${value} (${new Date(value * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC)`;
  if (name === 'bits') return `0x${value.toString(16).padStart(8, '0')}`;
  return String(value);
}

// The 80 bytes of a block header as stored and what each field means. Multi-byte values
// are little-endian and hashes are reversed against their usual spelling, so anyone can
// paste the bytes into a Bitcoin tool and get `hash`.
export function HeaderBytes({ header, hash }) {
  return (
    <div className="header-bytes">
      <dl className="header-bytes-fields">
        {headerFields(header).map(field => (
          <div key={field.name} className="header-bytes-field">
            <dt>{LABELS[field.name]} <span>{field.bytes.length / 2} bytes</span></dt>
            <dd>
              <code className="header-bytes-raw">{field.bytes}</code>
              <span className="header-bytes-value">{valueOf(field)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="header-bytes-note">
        Double SHA-256 of these 80 bytes, with its bytes reversed for display, is the hash{hash ? <>: <code>{hash}</code></> : '.'}
      </p>
      <CopyButton text={header} label="Copy 80 bytes" />
    </div>
  );
}
