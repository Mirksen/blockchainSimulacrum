// Operator commands for pool names. Uses the same DB_PATH as main.js.
//   node src/admin.js hide <name>     hide a name (and every spelling that folds to it)
//   node src/admin.js unhide <name>   show it again
//   node src/admin.js list-hidden     one line per hidden (folded) name
import { DatabaseSync } from 'node:sqlite';
import { NAME_RE, createHiddenNames, foldName } from './names.js';

const USAGE = 'usage: node src/admin.js hide <name> | unhide <name> | list-hidden';

const [command, name, ...extra] = process.argv.slice(2);
const takesName = command === 'hide' || command === 'unhide';
const usageOk = takesName
  ? typeof name === 'string' && NAME_RE.test(name) && extra.length === 0
  : command === 'list-hidden' && name === undefined;
if (!usageOk) {
  console.error(USAGE);
  process.exit(1);
}

const db = new DatabaseSync(process.env.DB_PATH || '/data/leaderboard.sqlite');
try {
  db.exec('PRAGMA busy_timeout = 5000;');
  const hidden = createHiddenNames(db);
  const label = takesName ? `${name} (folded: ${foldName(name)})` : '';
  if (command === 'hide') {
    console.log(`${hidden.hide(name, Date.now()) ? 'hidden' : 'already hidden'}: ${label}`);
  } else if (command === 'unhide') {
    console.log(`${hidden.unhide(name) ? 'unhidden' : 'not hidden'}: ${label}`);
  } else {
    const rows = hidden.list();
    for (const row of rows) console.log(`${row.folded}\t${new Date(row.hiddenAt).toISOString()}`);
    if (rows.length === 0) console.log('no hidden names');
  }
} finally {
  db.close();
}
