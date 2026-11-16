import { useId } from 'react';
import { fingerprintOf, OUTLINE } from '../../lib/fingerprintArt';

// The drawn fingerprint of a SHA-256 hash (lib/fingerprintArt.js). The ring color takes
// its hue from the hash and its saturation and lightness from a theme token
// (Basics.css, --basics-fp-ink), so the rings stay readable in both themes.
export function Fingerprint({ hash, size = 120, className = '' }) {
  const clip = `basics-fp-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const art = fingerprintOf(hash);
  const box = `${-OUTLINE.rx - 4} ${-OUTLINE.ry - 4} ${OUTLINE.rx * 2 + 8} ${OUTLINE.ry * 2 + 8}`;
  return (
    <svg className={`basics-fingerprint ${className}`.trim()} role="img" aria-label={`Drawn fingerprint of the hash starting ${hash.slice(0, 8)}`}
      viewBox={box} width={size} height={Math.round(size * (OUTLINE.ry + 4) / (OUTLINE.rx + 4))} style={{ '--fp-hue': art.hue }}>
      <defs>
        <clipPath id={clip}><ellipse cx="0" cy="0" rx={OUTLINE.rx} ry={OUTLINE.ry} /></clipPath>
      </defs>
      <ellipse className="basics-fingerprint-outline" cx="0" cy="0" rx={OUTLINE.rx} ry={OUTLINE.ry} />
      <g clipPath={`url(#${clip})`} className="basics-fingerprint-rings">
        {art.rings.map((ring, index) => (
          <ellipse key={index} cx={ring.ox} cy={art.cy} rx={ring.rx} ry={ring.ry}
            transform={`rotate(${ring.rotate} ${art.cx} ${art.cy})`}
            strokeDasharray={ring.dash.join(' ')} strokeDashoffset={ring.offset} strokeWidth={ring.width} />
        ))}
      </g>
    </svg>
  );
}
