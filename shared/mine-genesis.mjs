// Mines the proofofwork.fyi genesis block once and writes it to shared/genesis.json
// and the server's copy (the server container sees only server/).
//
//   node shared/mine-genesis.mjs [--zeros N]
//
// `targetZeros` is the planned difficulty; --zeros mines a quick draft with fewer zeros.
// The header records the difficulty actually mined, so a draft is still a valid block.
//
// The block uses the app's own format (web/src/lib/blockchain.js): the header hash is
// SHA256(previousHash + txRoot + timestamp + difficulty + nonce); with one coinbase
// transaction the txRoot is that transaction's hash,
// SHA256(sender + recipient + amount + fee + memo), where a null sender reads "null".
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const SHARED = new URL('./genesis.json', import.meta.url);
const SERVER_COPY = new URL('../server/src/genesis.json', import.meta.url);

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const zerosOf = hex => hex.length - hex.replace(/^0+/, '').length;

export function genesisTxRoot({ coinbase }) {
  return sha256(`${coinbase.sender}${coinbase.recipient}${coinbase.amount}${coinbase.fee}${coinbase.memo}`);
}

export function genesisHash(genesis, nonce = genesis.nonce) {
  return sha256(`${genesis.anchor.hash}${genesisTxRoot(genesis)}${genesis.timestamp}${genesis.difficulty}${nonce}`);
}

function mine(genesis, zeros) {
  const header = `${genesis.anchor.hash}${genesisTxRoot(genesis)}${genesis.timestamp}${genesis.difficulty}`;
  const started = Date.now();
  for (let nonce = genesis.startNonce; nonce <= Number.MAX_SAFE_INTEGER; nonce += 1) {
    const hash = sha256(header + nonce);
    if (zerosOf(hash) >= zeros) return { nonce, hash, seconds: (Date.now() - started) / 1000 };
    if ((nonce - genesis.startNonce) % 10_000_000 === 0 && nonce !== genesis.startNonce) {
      console.error(`… ${(nonce - genesis.startNonce).toLocaleString('en-US')} attempts`);
    }
  }
  throw new Error('nonce range exhausted');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = process.argv.indexOf('--zeros');
  const genesis = JSON.parse(readFileSync(SHARED, 'utf8'));
  const zeros = flag > -1 ? Number(process.argv[flag + 1]) : genesis.targetZeros;
  const block = { ...genesis, difficulty: zeros };
  const found = mine(block, zeros);
  const result = { ...block, status: zeros >= genesis.targetZeros ? 'mined' : 'draft',
    txRoot: genesisTxRoot(block), nonce: found.nonce, hash: found.hash };
  const text = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(SHARED, text);
  writeFileSync(SERVER_COPY, text);
  console.log(`${result.status}: nonce ${found.nonce}, hash ${found.hash} (${found.seconds.toFixed(1)} s)`);
}
