import { useEffect, useState } from 'react';
import { getRounds, minerProfileHash } from '../lib/poolApi';
import { hint, term } from '../lib/hints';

export function RoundHistory({ refreshKey = 0 }) {
  const [loaded, setLoaded] = useState({ state: 'loading', rounds: [] });
  useEffect(() => {
    const controller = new AbortController();
    getRounds({ signal: controller.signal }).then(rounds => {
      if (!controller.signal.aborted) setLoaded({ state: 'ready', rounds });
    }).catch(() => { if (!controller.signal.aborted) setLoaded({ state: 'unavailable', rounds: [] }); });
    return () => controller.abort();
  }, [refreshKey]);
  return <section className="pool-panel-board" aria-labelledby="finished-rounds-title">
    <h3 id="finished-rounds-title" {...term('pool.finished-rounds')}>Finished rounds</h3>
    <p className="pool-panel-help">Recent rounds outside the last 144 Bitcoin blocks. Counts and winners cover retained entries.</p>
    {loaded.state === 'loading' && <p>Loading finished rounds…</p>}
    {loaded.state === 'unavailable' && <p>Round history is unavailable right now.</p>}
    {loaded.state === 'ready' && loaded.rounds.length === 0 && <p>No finished rounds with retained blocks yet.</p>}
    {loaded.rounds.length > 0 && <div className="pool-panel-table" role="region" aria-label="Finished round results" tabIndex={0}><table>
      <thead><tr><th {...term('pool.round-block')} scope="col">Bitcoin block</th><th {...term('pool.miner-name')} scope="col">Winner</th><th {...term('pool.best-hash')} scope="col">Best hash</th><th {...term('pool.zeros')} scope="col">Zeros</th><th {...term('pool.blocks')} scope="col">Blocks</th></tr></thead>
      <tbody>{loaded.rounds.map(row => <tr key={`${row.round.height}:${row.round.hash}`}>
        <td><a href={`https://mempool.space/block/${row.round.height}`} target="_blank" rel="noreferrer" {...hint('pool.bitcoin-block', row.round.height)}>#{row.round.height}</a></td>
        <td><a href={minerProfileHash(row.name)} {...hint('pool.profile-link', row.name)}>{row.name}</a></td>
        <td><code title={row.bestHash}><span className="pool-panel-zero">{row.bestHash.slice(0, row.bestZeros)}</span>{row.bestHash.slice(row.bestZeros, 12)}…</code></td><td>{row.bestZeros}</td><td>{row.proofs.toLocaleString('en-US')}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
