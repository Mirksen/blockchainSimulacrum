// The end of the Basics course (no mission): the course's words next to Bitcoin's words.

const WORDS = Object.freeze([
  ['Page', 'Block'],
  ['Seal', 'Hash'],
  ['Lucky number', 'Nonce'],
  ['Notebook', 'Blockchain'],
  ['The draw', 'Mining'],
  ['Postage', 'Proof of work'],
  ['Guessing: 3 zeros', 'Difficulty'],
  ['Writer', 'Miner']
]);

export function Bridge() {
  return (
    <div className="basics-scene-body basics-bridge">
      <table className="basics-words">
        <thead><tr><th scope="col">Your words</th><th scope="col">Bitcoin's words</th></tr></thead>
        <tbody>
          {WORDS.map(([ours, bitcoin]) => <tr key={ours}><td>{ours}</td><td>{bitcoin}</td></tr>)}
        </tbody>
      </table>
      <p>You explored fingerprints (cryptography), linked blocks, and proof of work.
        Bitcoin also relies on a network of computers that check and share the chain. In Chain lab, choose Two nodes to see why their copies can briefly disagree.</p>
    </div>
  );
}
