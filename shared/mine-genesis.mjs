// Mines the proofofwork.fyi genesis block and writes it to shared/genesis.json and the
// server's copy (the server container sees only server/).
//
//   node shared/mine-genesis.mjs --anchor <bitcoin height> --zeros <n> --status bridge|final
//                                [--memo "<text>"] [--recipient <name>] [--amount <n>] [--threads <n>]
//
// Unset options keep the values in shared/genesis.json. The anchor's hash and time are
// read once from mempool.space; the genesis time is the anchor's time, so the block cannot
// predate it. The search runs on several threads, each taking every n-th nonce.
//
// The block uses the app's own format (web/src/lib/blockchain.js): the header hash is
// SHA256(previousHash + txRoot + timestamp + difficulty + nonce); with one coinbase
// transaction the txRoot is that transaction's hash,
// SHA256(sender + recipient + amount + fee + memo), where a null sender reads "null".
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

const SHARED = new URL('./genesis.json', import.meta.url);
const SERVER_COPY = new URL('../server/src/genesis.json', import.meta.url);
const API = 'https://mempool.space/api';

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

export function genesisTxRoot({ coinbase }) {
  return sha256(`${coinbase.sender}${coinbase.recipient}${coinbase.amount}${coinbase.fee}${coinbase.memo}`);
}

export function genesisHash(genesis, nonce = genesis.nonce) {
  return sha256(`${genesis.anchor.hash}${genesisTxRoot(genesis)}${genesis.timestamp}${genesis.difficulty}${nonce}`);
}

// Worker: nonces start, start + stride, … until one meets the target.
if (!isMainThread) {
  const { header, target, start, stride } = workerData;
  for (let nonce = start, tried = 0; ; nonce += stride, tried += 1) {
    const hash = sha256(header + nonce);
    if (hash.startsWith(target)) {
      parentPort.postMessage({ nonce, hash, tried: tried + 1 });
      break;
    }
    if (tried % 5_000_000 === 0 && tried) parentPort.postMessage({ tried });
  }
}

async function anchorAt(height) {
  const hash = (await (await fetch(`${API}/block-height/${height}`)).text()).trim();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`no block at height ${height}`);
  const block = await (await fetch(`${API}/block/${hash}`)).json();
  if (block.height !== height || !Number.isSafeInteger(block.timestamp)) throw new Error('unreadable block');
  return { chain: 'bitcoin', height, hash, time: block.timestamp };
}

function mine(genesis, threads) {
  const header = `${genesis.anchor.hash}${genesisTxRoot(genesis)}${genesis.timestamp}${genesis.difficulty}`;
  const target = '0'.repeat(genesis.difficulty);
  const started = Date.now();
  const tried = new Array(threads).fill(0);
  return new Promise((resolve, reject) => {
    const workers = Array.from({ length: threads }, (_, index) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { header, target, start: genesis.startNonce + index, stride: threads },
      });
      worker.on('message', message => {
        tried[index] = message.tried;
        if (message.hash === undefined) {
          const total = tried.reduce((a, b) => a + b, 0);
          if (index === 0) console.error(`… ${total.toLocaleString('en-US')} attempts, ${Math.round(total / ((Date.now() - started) / 1000)).toLocaleString('en-US')} H/s`);
          return;
        }
        for (const other of workers) void other.terminate();
        resolve({ nonce: message.nonce, hash: message.hash, seconds: (Date.now() - started) / 1000 });
      });
      worker.on('error', reject);
      return worker;
    });
  });
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: {
    anchor: { type: 'string' }, zeros: { type: 'string' }, status: { type: 'string' }, memo: { type: 'string' },
    recipient: { type: 'string' }, amount: { type: 'string' }, threads: { type: 'string' },
  } });
  const genesis = JSON.parse(readFileSync(SHARED, 'utf8'));
  if (values.anchor) {
    genesis.anchor = await anchorAt(Number(values.anchor));
    genesis.timestamp = genesis.anchor.time * 1000;
  }
  if (values.zeros) genesis.difficulty = Number(values.zeros);
  if (values.status) genesis.status = values.status;
  if (values.memo) genesis.coinbase.memo = values.memo;
  if (values.recipient) genesis.coinbase.recipient = values.recipient;
  if (values.amount) genesis.coinbase.amount = Number(values.amount);
  if (!['bridge', 'final'].includes(genesis.status)) throw new Error('--status must be bridge or final');
  const threads = Number(values.threads ?? Math.max(1, availableParallelism() - 1));
  console.error(`mining ${genesis.status} genesis on Bitcoin ${genesis.anchor.height} for ${genesis.difficulty} zeros on ${threads} threads`);
  const found = await mine(genesis, threads);
  const result = { status: genesis.status, anchor: genesis.anchor, timestamp: genesis.timestamp, difficulty: genesis.difficulty,
    coinbase: genesis.coinbase, startNonce: genesis.startNonce, txRoot: genesisTxRoot(genesis), nonce: found.nonce, hash: found.hash };
  if (genesisHash(result) !== found.hash) throw new Error('rebuilt hash differs');
  const text = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(SHARED, text);
  writeFileSync(SERVER_COPY, text);
  console.log(`${result.status}: nonce ${found.nonce}, hash ${found.hash} (${found.seconds.toFixed(1)} s)`);
}
