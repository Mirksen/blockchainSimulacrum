import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApp, GENESIS, PROOF_ZEROS, MIN_SHARE_ZEROS, MAX_SHARE_ZEROS } from './app.js';
import { createTipTracker } from './bitcoinTip.js';

const port = Number(process.env.PORT ?? 8080);
const dbPath = process.env.DB_PATH || '/data/leaderboard.sqlite';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://proofofwork.fyi')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const staticDir = process.env.STATIC_DIR || undefined;
const shareZerosRaw = process.env.SHARE_ZEROS ?? '';
const shareZeros = shareZerosRaw === '' ? PROOF_ZEROS : Number(shareZerosRaw);

if (!/^\d*$/.test(shareZerosRaw) || !Number.isInteger(shareZeros) || shareZeros < MIN_SHARE_ZEROS || shareZeros > MAX_SHARE_ZEROS) {
  console.error(`SHARE_ZEROS must be an integer from ${MIN_SHARE_ZEROS} to ${MAX_SHARE_ZEROS}`);
  process.exit(1);
}

if (GENESIS.status !== 'mined') console.log(`genesis is a ${GENESIS.status}, not the mined block: ${GENESIS.hash}`);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

// The round is the newest Bitcoin block; until it is known the pool answers 503.
const tip = createTipTracker({ log: (line) => console.log(line) });
tip.start();

const handler = createApp({
  db,
  tip,
  now: Date.now,
  allowedOrigins,
  staticDir,
  shareZeros,
  log: (line) => console.log(line),
});

const server = http.createServer(handler);
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;

server.listen(port, () => {
  console.log(`proofofwork server listening on port ${port}`);
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`received ${signal}, shutting down`);
  tip.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
