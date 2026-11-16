import { term } from '../../lib/hints/basics';

// All 64 characters of a hash in a 4 x 16 grid. `marked[i]` underlines and tints the
// character at position i (e.g. a character that differs from another hash); the
// scene states the count in text, so the marks never carry meaning alone.
export function HashGrid({ hash, label = 'Fingerprint (SHA-256 hash)', marked = null, small = false }) {
  return (
    <figure className={`basics-hash${small ? ' is-small' : ''}`}>
      <figcaption><span {...term('basics.hash')}>{label}</span></figcaption>
      <div className="basics-hash-grid" role="img" aria-label={`${label}: ${hash}`}>
        {[...hash].map((character, index) => (
          <span key={index} aria-hidden="true" className={marked?.[index] ? 'is-changed' : undefined}>{character}</span>
        ))}
      </div>
    </figure>
  );
}
