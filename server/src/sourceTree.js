// The git tree id of a directory, computed from the bytes on disk the way git does.
// /api/health reports it for the server's own src/, so anyone can check which commit
// a running server was built from: `git rev-parse <commit>:server/src` gives the same id.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function objectId(type, body) {
  return createHash('sha1').update(`${type} ${body.length}\0`).update(body).digest();
}

function treeId(dir) {
  const entries = readdirSync(dir, { withFileTypes: true }).map((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return { name: entry.name, key: `${entry.name}/`, mode: '40000', id: treeId(full) };
    if (!entry.isFile()) throw new Error(`gitTreeId: unsupported entry ${full}`);
    const mode = statSync(full).mode & 0o111 ? '100755' : '100644';
    return { name: entry.name, key: entry.name, mode, id: objectId('blob', readFileSync(full)) };
  });
  // git orders entries bytewise by name, a directory as if its name ended in '/'.
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  return objectId('tree', Buffer.concat(entries.flatMap((e) => [Buffer.from(`${e.mode} ${e.name}\0`), e.id])));
}

export function gitTreeId(dir) {
  return treeId(dir).toString('hex');
}
