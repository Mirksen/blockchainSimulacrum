/**
 * Blockchain Simulacrum - Browser-compatible ES6 Port
 * Original by Valentic, Mirko (2021, CS50)
 * Ported for modern React web application
 */

import { ec as EC } from 'elliptic';
import { deriveWallet } from './wallet';
import genesis from '../../../shared/genesis.json';
import { bitsOfZeros, displayHash, headerHex, meetsTarget, merkleRoot, utf8Hex, zerosOfTarget } from '../../../shared/bitcoin-block.mjs';
import { BLOCK_VERSION, hashAtNonce, headerPrefix, isNonce, sha256d } from './blockHeader';
import { addressOf, hash160 } from './tx/encoding';
import { createDescriber } from './tx/describe';
import { MAX_MEMO_BYTES, opReturnScript, p2pkhScript, p2pkScript } from './tx/script';
import { createCoinbase, Transaction } from './tx/transaction';
import { MAX_MONEY, selectCoins, validateChain } from './tx/utxo';

export { Transaction };

const ec = new EC('secp256k1');

// Participant class - wallet owners with cryptographic key pairs
export class Participant {
  constructor(name, isMiner = false, seedPhrase) {
    this.name = name;
    // The color stays with the participant through a rename (web/src/components/workbench/minerColors.js).
    this.colorKey = String(name).toLowerCase();
    const wallet = deriveWallet(seedPhrase);
    try {
      this.keyPair = ec.keyFromPrivate(wallet.privateKey);
    } finally {
      wallet.privateKey.fill(0);
    }
    this.publicKey = this.keyPair.getPublic(true, 'hex');
    this.privateKey = this.keyPair.getPrivate('hex');
    this.pubKeyHash = hash160(this.publicKey);
    this.scriptPubKey = p2pkhScript(this.pubKeyHash);
    this.address = addressOf(this.pubKeyHash);
    this.seedPhrase = wallet.seedPhrase;
    // Miner properties
    this.isMiner = isMiner;
    this.hashpower = 5; // A weight (1–100): the nonces the miner tries per turn; its share of all weights is its chance
    this.minerEnabled = true; // Can toggle miner on/off
    this.blocksWon = 0; // Counter for blocks mined
    this.activeMiner = false; // Legacy compatibility
  }

  static fromSeedPhrase(name, seedPhrase, isMiner = false) {
    // Unlike new-wallet creation, recovery must never fall back to generation.
    if (typeof seedPhrase !== 'string') {
      throw new Error('Enter a valid English BIP39 recovery phrase.');
    }
    return new Participant(name, isMiner, seedPhrase);
  }
}

// Bitcoin's merkle root over the transactions' txids. A transaction's `createHash()` in
// display order is all the block reads from it.
export function transactionRoot(transactions) {
  return merkleRoot(transactions.map(tx => tx.createHash()), sha256d);
}

// A block: an 80-byte Bitcoin header (version, previous hash, merkle root, time in seconds,
// compact bits, nonce) committing to its transactions through the root. `difficulty` is
// the number of leading hex zeros `bits` demands, the unit the UI speaks in.
export class Block {
  constructor(time, transactions, previousHash, bits) {
    this.version = BLOCK_VERSION;
    this.time = time;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.bits = bits;
    this.difficulty = zerosOfTarget(bits);
    this.txRoot = transactionRoot(transactions);
    this.nonce = 0;
    this.hash = this.createHash();
  }

  // The header as mined, with the stored root.
  header() {
    return { version: this.version, previousHash: this.previousHash, merkleRoot: this.txRoot,
      time: this.time, bits: this.bits, nonce: this.nonce };
  }

  // Recomputes the root from the current transactions, so editing any
  // transaction after mining changes this hash.
  createHash() {
    return displayHash(headerHex({ ...this.header(), merkleRoot: transactionRoot(this.transactions) }), sha256d);
  }

  isValid() {
    return this.hash === this.createHash();
  }
}

export const GENESIS = genesis;

export function createGenesisBlock() {
  const { header } = genesis;
  const block = new Block(header.time, [Transaction.parse(genesis.coinbaseHex)], genesis.anchor.hash, header.bits);
  block.version = header.version;
  block.nonce = header.nonce;
  block.hash = block.createHash();
  return block;
}

// Hash of a candidate block at a given nonce; equals Block.createHash for the
// block that acceptBlock builds from the same candidate and nonce.
export function candidateHash(candidate, nonce) {
  return hashAtNonce(candidate.header, nonce);
}

// Why a claimed proof for `candidate` fails, or null.
function proofProblem(candidate, nonce, hash) {
  if (!isNonce(nonce) || hash !== candidateHash(candidate, nonce)) return 'hash-mismatch';
  return meetsTarget(hash, candidate.bits) ? null : 'target-miss';
}

const WALLET_NAME = /^[A-Za-z0-9]{2,16}$/;
// Race lanes stay readable in the Next block card up to this many miners.
export const MAX_MINERS = 4;
// Hashpower is a weight of 1–100; a learner sets a miner's share of the enabled miners'
// hashpower in percent, between MIN_SHARE and MAX_SHARE.
export const MAX_HASHPOWER = 100;
export const MIN_SHARE = 5;
export const MAX_SHARE = 90;
const clampHashpower = value => Math.max(1, Math.min(MAX_HASHPOWER, Math.round(Number(value) || 5)));
export const DEFAULT_FEE = 0.00000001;
// Block space, scaled down from Bitcoin's so that a few transfers already compete for it:
// a block is at most MAX_BLOCK_BYTES, of which BLOCK_RESERVED_BYTES stay free for the
// 80-byte header, the transaction count and the coinbase (Bitcoin Core reserves room the
// same way). Payments share the rest.
export const MAX_BLOCK_BYTES = 1600;
export const BLOCK_RESERVED_BYTES = 300;
export const BLOCK_SPACE = MAX_BLOCK_BYTES - BLOCK_RESERVED_BYTES;
// Fee rates a sender can choose, in satoshis per byte.
export const FEE_RATES = Object.freeze([1, 5, 20]);
export const DEFAULT_FEE_RATE = 5;
// Bytes of a legacy transaction with P2PKH inputs and outputs: version, counts and locktime,
// each input with a signature of at most 72 bytes and a compressed key, each output. A memo
// adds an OP_RETURN output. Used to price a transfer at a fee rate before it is signed.
const estimateSize = ({ inputs, change, memoBytes }) => 10 + 148 * inputs + 34 * (change ? 2 : 1) +
  (memoBytes ? 10 + (memoBytes > 75 ? 2 : 1) + memoBytes : 0);
const satoshis = coins => Math.round(coins * 1e8);
const walletScript = publicKey => p2pkhScript(hash160(publicKey));
const sumValues = coins => coins.reduce((sum, coin) => sum + coin.value, 0);

// Blockchain class - the main chain management
export class Blockchain {
  constructor(name, miningDifficulty = 3, blockReward = 3.125, halvingEvent = 210000) {
    this.name = name;
    this.miningDifficulty = miningDifficulty;
    this.blockReward = blockReward;
    this.halvingEvent = halvingEvent;
    this.participants = [];
    this.blockArray = [this.createGenesisBlock()];
    this.memPool = [];
    this.miningLog = [];
    // Script verification results by "txid:input"; a txid commits to everything they depend on.
    this.verified = new Map();
    // Bumped by every change to blocks or mempool, so one state is walked once.
    this.revision = 0;
    this.walked = { revision: -1, ledger: null };
    // Original values of tampered outputs, keyed "block:tx"; set once per edit.
    this.tamperedOriginals = new Map();
    // Set by every change to an already mined block (tamper, undo, re-mine).
    this.historyEdited = false;
  }

  // Whether a new block may be appended. acceptBlock only extends a valid tip,
  // so the chain can only turn invalid through an edit of its history; the full
  // re-validation (every hash and signature) is needed only after one.
  canExtend() {
    return !this.historyEdited || this.isChainValid();
  }

  // The fixed genesis block of proofofwork.fyi (shared/genesis.json): built on a
  // Bitcoin block of its launch day, with one unspendable coinbase carrying its
  // memo, like Satoshi's. Every chain and every pool proof starts from this hash.
  createGenesisBlock() {
    return createGenesisBlock();
  }

  addParticipant(name, isMiner = false) {
    const participant = new Participant(name, isMiner);
    this.participants.push(participant);
    return participant;
  }

  // A wallet the learner creates: a non-miner participant that starts without coins.
  addWallet(name) {
    return this.addNamed(name, false);
  }

  // A miner the learner creates: a wallet that races from the next block on with the
  // default hashpower. Miners and wallets share one name space.
  addMiner(name) {
    if (this.participants.filter(p => p.isMiner).length >= MAX_MINERS) {
      return { success: false, error: `At most ${MAX_MINERS} miners race in this simulation.` };
    }
    // The new miner joins with the average hashpower of the enabled miners: an equal share.
    const racing = this.getActiveMiners();
    const result = this.addNamed(name, true);
    // Three default miners leave room for one more: it gets the spare miner color.
    if (result.success) {
      result.participant.colorKey = 'spare';
      if (racing.length) result.participant.hashpower = clampHashpower(racing.reduce((sum, p) => sum + p.hashpower, 0) / racing.length);
    }
    return result;
  }

  addNamed(name, isMiner) {
    const checked = this.checkName(name, isMiner ? 'miner' : 'wallet');
    if (!checked.success) return checked;
    const participant = this.addParticipant(checked.name, isMiner);
    return { success: true, error: null, participant };
  }

  // The shared name rule: 2–16 letters or digits, unique regardless of letter case.
  checkName(name, noun, except = null) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!WALLET_NAME.test(trimmed)) return { success: false, error: `Use 2–16 letters or digits for the ${noun} name.` };
    const taken = this.participants.some(p => p !== except && p.name.toLowerCase() === trimmed.toLowerCase());
    if (taken) return { success: false, error: `A wallet named ${trimmed} already exists.` };
    return { success: true, error: null, name: trimmed };
  }

  // A new display name for a participant. Blocks and transactions store scripts, not
  // names, so every view shows the new name; the participant keeps its keys and color.
  renameParticipant(name, next) {
    const participant = this.getParticipantByName(name);
    if (!participant) return { success: false, error: `${name} does not exist.` };
    const checked = this.checkName(next, participant.isMiner ? 'miner' : 'wallet', participant);
    if (!checked.success) return checked;
    participant.name = checked.name;
    return { success: true, error: null, participant };
  }

  getParticipantByName(name) {
    return this.participants.find(p => p.name === name);
  }

  setMiner(name) {
    const participant = this.getParticipantByName(name);
    if (participant) {
      participant.isMiner = true;
      participant.activeMiner = true;
    }
    return participant;
  }

  getActiveMiner() {
    // Legacy: return first active miner
    return this.participants.find(p => p.isMiner && p.minerEnabled);
  }

  getActiveMiners() {
    // Return all enabled miners
    return this.participants.filter(p => p.isMiner && p.minerEnabled);
  }

  toggleMiner(name) {
    const participant = this.getParticipantByName(name);
    if (participant && participant.isMiner) {
      participant.minerEnabled = !participant.minerEnabled;
    }
    return participant;
  }

  setMinerHashpower(name, hashpower) {
    const participant = this.getParticipantByName(name);
    if (participant && participant.isMiner) {
      participant.hashpower = clampHashpower(hashpower);
    }
    return participant;
  }

  // Gives an enabled miner `percent` of the enabled miners' hashpower (MIN_SHARE–MAX_SHARE).
  // The others share the rest in their previous proportion; the weights then add up to 100.
  // Returns the new weights by name, or null when the miner does not race or races alone.
  setMinerShare(name, percent) {
    const racing = this.getActiveMiners();
    const miner = racing.find(p => p.name === name);
    if (!miner || racing.length < 2 || !Number.isFinite(Number(percent))) return null;
    const share = Math.max(MIN_SHARE, Math.min(MAX_SHARE, Math.round(Number(percent))));
    const others = racing.filter(p => p !== miner);
    const rest = MAX_HASHPOWER - share;
    const before = others.reduce((sum, p) => sum + p.hashpower, 0);
    // Largest remainders keep the sum exact; every other miner keeps at least weight 1.
    const exact = others.map(p => (before > 0 ? p.hashpower / before : 1 / others.length) * rest);
    const weights = exact.map(value => Math.max(1, Math.floor(value)));
    let left = rest - weights.reduce((sum, w) => sum + w, 0);
    const order = exact.map((value, i) => i).sort((a, b) => (exact[b] - Math.floor(exact[b])) - (exact[a] - Math.floor(exact[a])));
    for (let k = 0; left > 0; k++, left--) weights[order[k % order.length]]++;
    for (let k = 0; left < 0; k++) { const i = order[order.length - 1 - (k % order.length)]; if (weights[i] > 1) { weights[i]--; left++; } }
    miner.hashpower = share;
    others.forEach((p, i) => { p.hashpower = weights[i]; });
    return Object.fromEntries(racing.map(p => [p.name, p.hashpower]));
  }

  incrementBlocksWon(minerPublicKey) {
    const participant = this.participants.find(p => p.publicKey === minerPublicKey);
    if (participant) {
      participant.blocksWon++;
    }
    return participant;
  }

  // The UTXO set and every rule check, computed from the blocks and the mempool (./tx/utxo.js).
  ledger() {
    if (this.walked.revision !== this.revision) {
      this.walked = { revision: this.revision, ledger: validateChain(this.blockArray, this.memPool, this.verified) };
    }
    return this.walked.ledger;
  }

  // Unspent outputs a key can spend; `pending` includes the mempool, which also spends coins.
  coinsOf(publicKey, { pending = false } = {}) {
    const script = walletScript(publicKey);
    const ledger = this.ledger();
    return [...(pending ? ledger.pending : ledger.confirmed).values()].filter(coin => coin.scriptPubKey === script);
  }

  // Balance including pending mempool transactions, what a wallet can still spend.
  calculateBalance(publicKey) {
    return sumValues(this.coinsOf(publicKey, { pending: true })) / 1e8;
  }

  // Confirmed balance only (for display): the sum of the wallet's unspent outputs.
  calculateConfirmedBalance(publicKey) {
    return sumValues(this.coinsOf(publicKey)) / 1e8;
  }

  getAllBalances() {
    const { confirmed } = this.ledger();
    return this.participants.map(p => {
      const coins = [...confirmed.values()].filter(coin => coin.scriptPubKey === p.scriptPubKey);
      return { name: p.name, publicKey: p.publicKey, balance: sumValues(coins) / 1e8, coins, isMiner: p.isMiner && p.minerEnabled };
    });
  }

  // The coins, change and fee a transfer would use; nothing is created. Reads the coins including the mempool.
  planSpend(sender, amount, fee) {
    const coins = this.coinsOf(sender.publicKey, { pending: true });
    const selection = selectCoins(coins, amount + fee);
    if (!selection) return { funded: false, balance: sumValues(coins), required: amount + fee };
    return { funded: true, coins: selection.coins, amount, fee, change: selection.total - amount - fee };
  }

  // What the transaction form shows before anything is signed.
  previewTransaction(senderName, amount, transactionFee = DEFAULT_FEE) {
    const sender = this.getParticipantByName(senderName);
    if (!sender || !Number.isFinite(amount) || amount <= 0) return null;
    return this.planSpend(sender, satoshis(amount), satoshis(transactionFee));
  }

  // A transfer priced at `feeRate` satoshis per byte: the fee follows the size, the size
  // follows the coins it needs, so the plan settles in a few rounds. `size` is the
  // estimate the fee was priced on; a signature one byte shorter leaves the rate a little higher.
  planAtRate(senderName, amount, feeRate = DEFAULT_FEE_RATE, reference = '') {
    const sender = this.getParticipantByName(senderName);
    if (!sender || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(feeRate) || feeRate < 0) return null;
    const value = satoshis(amount);
    const memoBytes = reference ? utf8Hex(reference).length / 2 : 0;
    let inputs = 1;
    let plan = null;
    for (let round = 0; round < 8; round++) {
      const withChange = estimateSize({ inputs, change: true, memoBytes });
      plan = this.planSpend(sender, value, Math.ceil(feeRate * withChange));
      if (!plan.funded) return { ...plan, feeRate };
      if (plan.coins.length !== inputs) { inputs = plan.coins.length; continue; }
      // Without change the transaction is smaller; the same coins pay that size's fee.
      const size = plan.change > 0 ? withChange : estimateSize({ inputs, change: false, memoBytes });
      return { ...plan, size, feeRate };
    }
    return { ...plan, feeRate };
  }

  createTransactionAtRate(senderName, recipientName, amount, feeRate = DEFAULT_FEE_RATE, reference) {
    if (!Number.isFinite(feeRate) || feeRate < 0) throw new Error('Fee rate must be a non-negative number of satoshis per byte');
    const plan = this.planAtRate(senderName, amount, feeRate, reference);
    if (plan && !plan.funded) throw new Error(`Insufficient funds. Balance: ${plan.balance / 1e8}, Required: ${plan.required / 1e8}`);
    // Without a plan (unknown sender or invalid amount) createTransaction names the problem.
    return this.createTransaction(senderName, recipientName, amount, plan ? plan.fee / 1e8 : 0, reference);
  }

  // Which pending transactions the next block has room for, as a miner chooses them, like
  // Bitcoin Core: a transaction goes in together with the pending ones it spends from (its
  // package), and the package with the highest fee per byte that still fits into BLOCK_SPACE
  // goes first. So a child with a high fee pulls its cheap parent along (child pays for
  // parent). `included` holds mempool indices in block order, parents before children;
  // `waiting` explains every other entry: `full` (no room left), `parent` (it spends a pending
  // transaction that has no room) or `invalid` (an edit of history orphaned it). `rate` is a
  // transaction's own fee per byte, in satoshis.
  blockTemplate(space = BLOCK_SPACE) {
    const ledger = this.ledger();
    const position = new Map(this.memPool.map((tx, index) => [tx.createHash(), index]));
    const entries = this.memPool.map((tx, index) => {
      const { valid, fee } = ledger.memPool[index];
      const parents = [...new Set(tx.inputs.map(input => position.get(input.txid)).filter(parent => parent !== undefined))];
      return { index, size: tx.size, fee: valid ? fee : null, rate: valid ? fee / tx.size : null, valid, parents };
    });
    const included = [];
    const taken = new Set();
    let bytes = 0;
    // The entry and every pending ancestor not yet in the block, in mempool order; the
    // mempool only accepts a transaction after the ones it spends from, so parents come first.
    const packageOf = entry => {
      const members = new Set([entry.index]);
      const visit = node => node.parents.forEach(parent => {
        if (!taken.has(parent) && !members.has(parent)) { members.add(parent); visit(entries[parent]); }
      });
      visit(entry);
      return [...members].sort((a, b) => a - b).map(index => entries[index]);
    };
    for (;;) {
      let best = null;
      for (const entry of entries) {
        if (!entry.valid || taken.has(entry.index)) continue;
        const members = packageOf(entry);
        const size = members.reduce((sum, member) => sum + member.size, 0);
        if (bytes + size > space) continue;
        const rate = members.reduce((sum, member) => sum + member.fee, 0) / size;
        if (!best || rate > best.rate) best = { members, size, rate };
      }
      if (!best) break;
      best.members.forEach(member => { taken.add(member.index); included.push(member.index); });
      bytes += best.size;
    }
    const waiting = entries.filter(entry => entry.valid && !taken.has(entry.index))
      .sort((a, b) => b.rate - a.rate || a.index - b.index).map(entry => entry.index)
      .concat(entries.filter(entry => !entry.valid).map(entry => entry.index));
    const reasons = Object.fromEntries(waiting.map(index => [index, !entries[index].valid ? 'invalid'
      : entries[index].parents.every(parent => taken.has(parent)) ? 'full' : 'parent']));
    const fees = included.reduce((sum, index) => sum + entries[index].fee, 0);
    return { included, waiting, reasons, entries, bytes, space, fees };
  }

  // Mempool policy: the transaction must spend existing unspent coins with valid scripts and
  // create no value. A coin already spent by a pending transaction is a double spend.
  acceptToMempool(tx) {
    const check = validateChain(this.blockArray, [...this.memPool, tx], this.verified).memPool.at(-1);
    if (!check.valid) return { success: false, reason: check.issues[0].reason };
    this.memPool.push(tx);
    this.revision++;
    return { success: true, reason: null };
  }

  createTransaction(senderName, recipientName, amount, transactionFee, reference) {
    if (!Number.isFinite(amount) || amount <= 0 || Number(amount.toFixed(8)) !== amount) {
      throw new Error('Amount must be positive with at most 8 decimal places');
    }
    if (!Number.isFinite(transactionFee) || transactionFee < 0 || Number(transactionFee.toFixed(8)) !== transactionFee) {
      throw new Error('Fee must be non-negative with at most 8 decimal places');
    }
    if (senderName === recipientName) throw new Error('Sender and recipient must be different');
    const sender = this.getParticipantByName(senderName);
    const recipient = this.getParticipantByName(recipientName);

    if (!sender || !recipient) {
      throw new Error('Sender or recipient not found');
    }
    const memo = reference ? utf8Hex(reference) : '';
    if (memo.length / 2 > MAX_MEMO_BYTES) throw new Error(`Reference must fit in ${MAX_MEMO_BYTES} bytes`);

    const plan = this.planSpend(sender, satoshis(amount), satoshis(transactionFee));
    if (!plan.funded) {
      throw new Error(`Insufficient funds. Balance: ${plan.balance / 1e8}, Required: ${plan.required / 1e8}`);
    }
    const outputs = [{ value: plan.amount, scriptPubKey: recipient.scriptPubKey }];
    if (plan.change > 0) outputs.push({ value: plan.change, scriptPubKey: sender.scriptPubKey });
    if (memo) outputs.push({ value: 0, scriptPubKey: opReturnScript(memo) });
    const tx = new Transaction({ inputs: plan.coins.map(({ txid, vout }) => ({ txid, vout })), outputs });
    plan.coins.forEach((coin, index) => tx.signInput(index, sender.keyPair, coin.scriptPubKey));
    const accepted = this.acceptToMempool(tx);
    if (!accepted.success) throw new Error(`Transaction rejected: ${accepted.reason}`);
    return tx;
  }

  // A header's time may equal its predecessor's, never run behind it.
  nextBlockTime() {
    return Math.max(Math.floor(Date.now() / 1000), this.blockArray.at(-1).time);
  }

  // Freeze the work for one miner: everything except the nonce is fixed here, so a
  // search only varies the last four header bytes. A further extraNonce changes the
  // coinbase and with it the root, which opens a fresh nonce space. A `signature` writes
  // the miner's name into the coinbase and commits it to a leaderboard round.
  prepareCandidate(miner, { time = this.nextBlockTime(), extraNonce = 0, signature = null } = {}) {
    const height = this.blockArray.length;
    const reward = height % this.halvingEvent === 0 ? this.blockReward / 2 : this.blockReward;
    // The block takes what fits, highest fee rate first (blockTemplate). An edit of history can
    // orphan a pending transaction; it stays for an undo but stays out of the block.
    const template = this.blockTemplate();
    const included = template.included.map(index => this.memPool[index]);
    const fees = template.fees;
    const subsidy = Math.floor(reward * 1e8);
    const difficulty = this.miningDifficulty;
    const bits = bitsOfZeros(difficulty);
    const coinbase = createCoinbase({ height, value: subsidy + fees, recipientScript: miner.scriptPubKey, extraNonce,
      ...(signature ? { tag: signature.name, commitment: signature.commitment } : {}) });
    const transactions = Object.freeze([coinbase, ...included]);
    const previousHash = this.blockArray[height - 1].hash;
    const txRoot = transactionRoot(transactions);
    return Object.freeze({
      previousHash,
      time,
      difficulty,
      bits,
      extraNonce,
      reward,
      subsidy,
      halved: reward !== this.blockReward,
      transactions,
      minerPublicKey: miner.publicKey,
      height,
      txRoot,
      header: headerPrefix({ version: BLOCK_VERSION, previousHash, merkleRoot: txRoot, time, bits })
    });
  }

  // Append a solved candidate. Nothing changes unless the proof is valid and
  // the candidate still extends the current tip.
  acceptBlock(candidate, nonce, hash) {
    const problem = proofProblem(candidate, nonce, hash);
    if (problem) return { status: 'rejected', reason: problem };
    if (this.blockArray.length !== candidate.height || this.blockArray.at(-1).hash !== candidate.previousHash) {
      return { status: 'stale' };
    }
    const block = new Block(candidate.time, [...candidate.transactions], candidate.previousHash, candidate.bits);
    block.nonce = nonce;
    block.hash = hash;
    block.halved = candidate.halved;
    block.subsidy = candidate.subsidy;
    this.blockArray.push(block);
    this.revision++;
    // Everything the block spent, and every entry it invalidated, leaves the mempool.
    const { memPool } = this.ledger();
    this.memPool = this.memPool.filter((_, i) => memPool[i].valid);
    this.revision++;
    this.blockReward = candidate.reward;
    this.incrementBlocksWon(candidate.minerPublicKey);
    this.miningLog.push({ blockNumber: candidate.height, nonce, hash });
    return { status: 'accepted', block };
  }

  // Halving epoch of the block at `height`: the number of halvings applied up
  // to and including it (0 before the first halving).
  epochAt(height) {
    return this.blockArray.slice(1, height + 1).filter(block => block.halved === true).length;
  }

  // Freeze the work to re-mine historical block `index`: it is re-linked to its
  // predecessor's current stored hash and needs the current target; its
  // transactions stay as they are, so the coinbase cannot open a fresh nonce space; a
  // positive `timeRoll` moves the header's time forward instead. Every earlier block must
  // be valid.
  prepareRemine(index, { difficulty = this.miningDifficulty, timeRoll = 0 } = {}) {
    if (!Number.isInteger(index) || index < 1 || index >= this.blockArray.length) {
      return { success: false, code: 'invalid_block', error: 'Choose a mined block after Genesis to re-mine.' };
    }
    const broken = this.firstBrokenBlock();
    if (broken !== null && broken < index) {
      return { success: false, code: 'repair_first', repairFirst: broken, error: `Re-mine block #${broken} first.` };
    }
    const block = this.blockArray[index];
    const previousHash = this.blockArray[index - 1].hash;
    const txRoot = transactionRoot(block.transactions);
    const bits = bitsOfZeros(difficulty);
    const time = block.time + timeRoll;
    return {
      success: true,
      candidate: Object.freeze({
        index, previousHash, time, difficulty, bits, txRoot,
        header: headerPrefix({ version: block.version, previousHash, merkleRoot: txRoot, time, bits })
      })
    };
  }

  // Store a re-mining proof. Nothing changes unless the proof is valid and the
  // block, its predecessor and every earlier block are as they were prepared.
  acceptRemine(candidate, nonce, hash) {
    const problem = proofProblem(candidate, nonce, hash);
    if (problem) return { status: 'rejected', reason: problem };
    const block = this.blockArray[candidate.index];
    const broken = this.firstBrokenBlock();
    if (!block || this.blockArray[candidate.index - 1].hash !== candidate.previousHash ||
      transactionRoot(block.transactions) !== candidate.txRoot || (broken !== null && broken < candidate.index)) {
      return { status: 'stale' };
    }
    block.previousHash = candidate.previousHash;
    block.txRoot = candidate.txRoot;
    block.time = candidate.time;
    block.bits = candidate.bits;
    block.difficulty = candidate.difficulty;
    block.nonce = nonce;
    block.hash = hash;
    this.historyEdited = true;
    this.revision++;
    return { status: 'accepted', block };
  }

  // Validation methods
  areBlocksValid() {
    // Genesis block validity check (timestamp-agnostic)
    if (!this.blockArray[0].isValid()) return false;

    for (let i = 1; i < this.blockArray.length; i++) {
      const currentBlock = this.blockArray[i];
      const previousBlock = this.blockArray[i - 1];

      if (!currentBlock.isValid()) return false;
      if (currentBlock.previousHash !== previousBlock.hash) return false;
    }

    return true;
  }

  // Per-block checks for the chain health view. A block's own status:
  // `hash-mismatch` when its content no longer produces the stored hash or the
  // stored hash misses its target; `link-broken` when its stored previous hash
  // differs from the predecessor's stored hash; `signature-invalid` when hash
  // and link are fine but a spend no longer matches its signature;
  // `transaction-invalid` when hash and link are fine but the block breaks another
  // ledger rule (`issue` names it); `built-on-broken` when the block itself is fine
  // but an earlier block is broken; otherwise `valid`. Re-mining repairs hashes and
  // links, never transactions, so `issue` is set as soon as the rule is broken,
  // also while a hash mismatch still decides the status.
  inspectBlocks() {
    const ledger = this.ledger();
    let brokenBefore = false;
    return this.blockArray.map((block, index) => {
      const storedHash = block.hash;
      const computedHash = block.createHash();
      const hashMatches = storedHash === computedHash;
      const hashMeetsTarget = meetsTarget(storedHash, block.bits);
      // Genesis has no predecessor; its link is intact by definition.
      const linkIntact = index === 0 || block.previousHash === this.blockArray[index - 1].hash;
      const { issues } = ledger.blocks[index];
      const signaturesValid = !issues.some(issue => issue.reason === 'signature');
      const builtOnBroken = brokenBefore;
      const status = !hashMatches || !hashMeetsTarget ? 'hash-mismatch'
        : !linkIntact ? 'link-broken'
          : !signaturesValid ? 'signature-invalid'
            : issues.length ? 'transaction-invalid'
              : builtOnBroken ? 'built-on-broken' : 'valid';
      if (status !== 'valid') brokenBefore = true;
      return { index, storedHash, computedHash, hashMatches, meetsTarget: hashMeetsTarget, linkIntact, signaturesValid, builtOnBroken, status,
        issue: issues[0] ?? null };
    });
  }

  // Index of the first block whose status is not `valid`, or null.
  firstBrokenBlock() {
    return this.inspectBlocks().find(check => check.status !== 'valid')?.index ?? null;
  }

  areTransactionsValid() {
    return this.ledger().blocks.every(block => block.issues.length === 0);
  }

  isChainValid() {
    return this.areBlocksValid() && this.areTransactionsValid();
  }

  // Tamper with a transaction (for demo purposes): changes the value of its first
  // output, the payment or the reward. The first edit of a transaction remembers the
  // original value; setting that value again ends the edit.
  tamperTransaction(blockIndex, txIndex, newAmount) {
    const output = this.blockArray[blockIndex]?.transactions[txIndex]?.outputs[0];
    const value = satoshis(newAmount);
    if (!output || !Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY || value / 1e8 !== newAmount) return false;
    const key = `${blockIndex}:${txIndex}`;
    if (!this.tamperedOriginals.has(key)) this.tamperedOriginals.set(key, { blockIndex, txIndex, value: output.value });
    output.value = value;
    this.historyEdited = true;
    this.revision++;
    if (this.tamperedOriginals.get(key).value === value) this.tamperedOriginals.delete(key);
    return true;
  }

  // Restore the original values of every edited transaction in one block.
  undoTamper(blockIndex) {
    let restored = 0;
    for (const [key, edit] of this.tamperedOriginals) {
      if (edit.blockIndex !== blockIndex) continue;
      this.blockArray[edit.blockIndex].transactions[edit.txIndex].outputs[0].value = edit.value;
      this.tamperedOriginals.delete(key);
      this.historyEdited = true;
      this.revision++;
      restored++;
    }
    return { success: restored > 0, restored };
  }

  // Current edits, ordered by block and transaction: amount `from` → `to`.
  getTamperedEdits() {
    return [...this.tamperedOriginals.values()]
      .map(({ blockIndex, txIndex, value }) => ({ blockIndex, txIndex, from: value / 1e8,
        to: this.blockArray[blockIndex].transactions[txIndex].outputs[0].value / 1e8 }))
      .sort((a, b) => a.blockIndex - b.blockIndex || a.txIndex - b.txIndex);
  }

  // describe(tx) for the UI over the current chain and mempool (./tx/describe.js).
  describer() {
    const names = new Map(this.participants.map(p => [p.scriptPubKey, p.name]));
    names.set(p2pkScript(genesis.coinbase.pubkey), genesis.coinbase.recipient);
    return createDescriber({ blocks: this.blockArray, memPool: this.memPool, ledger: this.ledger(), names, verified: this.verified });
  }

  // Get block details
  getBlockDetails(index) {
    return this.blockArray[index] || null;
  }
}

// Factory function for easy initialization
export function createBlockchain(config = {}) {
  const {
    name = 'powfyicoin',
    miningDifficulty = 1,
    blockReward = 3.125,
    halvingEvent = 210000,
    participants = ['Alice', 'Bob', 'Chris', 'Hal', 'Dorian', 'Laszlo'],
    miners = ['Hal', 'Dorian', 'Laszlo']
  } = config;

  const blockchain = new Blockchain(name, miningDifficulty, blockReward, halvingEvent);

  // Add participants, marking miners accordingly
  participants.forEach(pName => {
    const isMiner = miners.includes(pName);
    blockchain.addParticipant(pName, isMiner);
  });

  // Set first miner as legacy activeMiner for compatibility
  if (miners.length > 0) {
    blockchain.setMiner(miners[0]);
  }

  return blockchain;
}
