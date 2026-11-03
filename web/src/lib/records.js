// Records worth a celebration (web/DESIGN.md, "Record celebration"): what the visitor's
// own row on the all-time leaderboard gained with an accepted block. Pure, so the App
// only compares the board before and after the block.

// { rank, zeros } of `name` in all-time rows, or null when the name is not on the board.
export function ownRow(rows, name) {
  if (!Array.isArray(rows) || !name) return null;
  const index = rows.findIndex(row => row?.name === name);
  if (index < 0) return null;
  const row = rows[index];
  return { rank: Number.isSafeInteger(row.rank) ? row.rank : index + 1, zeros: Number.isSafeInteger(row.bestZeros) ? row.bestZeros : 0 };
}

// The one record `after` holds over `before`, the biggest first:
// 'top' (rank 1), 'entered' (first time on the board), 'climbed' (a better rank),
// 'zeros' (more leading zeros than ever, same rank); null when nothing improved.
export function recordOf(before, after) {
  if (!after) return null;
  if (!before) return { kind: after.rank === 1 ? 'top' : 'entered', rank: after.rank, zeros: after.zeros };
  if (after.rank < before.rank) {
    return { kind: after.rank === 1 ? 'top' : 'climbed', rank: after.rank, zeros: after.zeros, places: before.rank - after.rank };
  }
  if (after.zeros > before.zeros) return { kind: 'zeros', rank: after.rank, zeros: after.zeros, previousZeros: before.zeros };
  return null;
}

const zeros = count => `${count} leading ${count === 1 ? 'zero' : 'zeros'}`;

// Headline and line under it for a record of `name`.
export function recordCopy(record) {
  switch (record.kind) {
    case 'top':
      return { title: 'Rank #1 of all time!', text: `Your best hash, with ${zeros(record.zeros)}, beats every miner on the board.` };
    case 'entered':
      return { title: 'You are on the leaderboard!', text: `Rank #${record.rank} of all time with ${zeros(record.zeros)}. Every block can take you higher.` };
    case 'climbed':
      return { title: `New rank: #${record.rank}`, text: `Up ${record.places} ${record.places === 1 ? 'place' : 'places'} on the all-time board. Keep mining.` };
    default:
      return { title: `New best: ${record.zeros} zeros`, text: `Your best hash yet, ${record.zeros - record.previousZeros} more than before. Rank #${record.rank}.` };
  }
}
