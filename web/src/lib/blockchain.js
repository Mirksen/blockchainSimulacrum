/**
 * Blockchain Simulacrum - Browser-compatible ES6 Port
 * Original by Valentic, Mirko (2021, CS50)
 * Ported for modern React web application
 */

import SHA256 from 'crypto-js/sha256';
import { ec as EC } from 'elliptic';
import { deriveWallet } from './wallet';
import genesis from '../../../shared/genesis.json';
import { displayHash, headerHex, zerosOfTarget } from '../../../shared/bitcoin-block.mjs';
import { addressOf, hash160, sha256d, utf8Hex } from './tx/encoding';
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
    this.hashpower = 5; // 1-10 scale, affects mining speed
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

// Merkle root of a transaction list (Bitcoin-style): each leaf is the
// transaction hash, each parent is SHA256(left + right), an odd level repeats
// its last hash, and an empty list has an all-zero root.
const EMPTY_ROOT = '0'.repeat(64);

export function transactionRoot(transactions) {
  if (transactions.length === 0) return EMPTY_ROOT;
  let level = transactions.map(tx => tx.createHash());
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(SHA256(left + right).toString());
    }
    level = next;
  }
  return level[0];
}

// Block class - a header (previous hash, transaction root, timestamp,
// difficulty, nonce) committing to its transactions through the root
export class Block {
  constructor(timestamp, transactions, previousHash = '', difficulty = 0) {
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.difficulty = difficulty;
    this.txRoot = transactionRoot(transactions);
    this.nonce = 0;
    this.hash = this.createHash();
  }

  // Recomputes the root from the current transactions, so editing any
  // transaction after mining changes this hash.
  createHash() {
    return SHA256(
      this.previousHash +
      transactionRoot(this.transactions) +
      this.timestamp +
      this.difficulty +
      this.nonce
    ).toString();
  }

  isValid() {
    return this.hash === this.createHash();
  }
}

export const GENESIS = genesis;

// The genesis block hashes its 80-byte Bitcoin header with double SHA-256, like
// Satoshi's block 0; every later block uses the app's own header format.
class GenesisBlock extends Block {
  createHash() {
    const { version, time, bits } = genesis.header;
    return displayHash(headerHex({ version, previousHash: this.previousHash, merkleRoot: transactionRoot(this.transactions),
      time, bits, nonce: this.nonce }), sha256d);
  }
}

export function createGenesisBlock() {
  const { header } = genesis;
  const timestamp = header.time * 1000;
  const block = new GenesisBlock(timestamp, [Transaction.parse(genesis.coinbaseHex)], genesis.anchor.hash, zerosOfTarget(header.bits));
  block.nonce = header.nonce;
  block.hash = block.createHash();
  return block;
}

// Hash of a candidate block at a given nonce; equals Block.createHash for the
// block that acceptBlock builds from the same candidate and nonce.
export function candidateHash(candidate, nonce) {
  return SHA256(candidate.prefix + nonce).toString();
}

const WALLET_NAME = /^[A-Za-z0-9]{2,16}$/;
export const DEFAULT_FEE = 0.00000001;
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
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!WALLET_NAME.test(trimmed)) return { success: false, error: 'Use 2–16 letters or digits for the wallet name.' };
    const taken = this.participants.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (taken) return { success: false, error: `A wallet named ${trimmed} already exists.` };
    const participant = this.addParticipant(trimmed, false);
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
      participant.hashpower = Math.max(1, Math.min(10, hashpower));
    }
    return participant;
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

  // Freeze the work for one miner: everything except the nonce is fixed here,
  // so a search only varies the nonce appended to `prefix`.
  prepareCandidate(miner, { timestamp = Date.now() } = {}) {
    const height = this.blockArray.length;
    const reward = height % this.halvingEvent === 0 ? this.blockReward / 2 : this.blockReward;
    // An edit of history can orphan a pending transaction; it stays for an undo but stays out of the block.
    const ledger = this.ledger();
    const included = this.memPool.filter((_, i) => ledger.memPool[i].valid);
    const fees = ledger.memPool.reduce((sum, entry) => sum + (entry.valid ? entry.fee : 0), 0);
    const subsidy = Math.floor(reward * 1e8);
    const transactions = Object.freeze([
      createCoinbase({ height, value: subsidy + fees, recipientScript: miner.scriptPubKey }),
      ...included
    ]);
    const previousHash = this.blockArray[height - 1].hash;
    const difficulty = this.miningDifficulty;
    const txRoot = transactionRoot(transactions);
    return Object.freeze({
      previousHash,
      timestamp,
      difficulty,
      target: '0'.repeat(difficulty),
      reward,
      subsidy,
      halved: reward !== this.blockReward,
      transactions,
      minerPublicKey: miner.publicKey,
      height,
      txRoot,
      // Fixed-size header: the root stands in for every transaction.
      prefix: previousHash + txRoot + timestamp + difficulty
    });
  }

  // Append a solved candidate. Nothing changes unless the proof is valid and
  // the candidate still extends the current tip.
  acceptBlock(candidate, nonce, hash) {
    if (hash !== candidateHash(candidate, nonce)) return { status: 'rejected', reason: 'hash-mismatch' };
    if (!hash.startsWith(candidate.target)) return { status: 'rejected', reason: 'target-miss' };
    if (this.blockArray.length !== candidate.height || this.blockArray.at(-1).hash !== candidate.previousHash) {
      return { status: 'stale' };
    }
    const block = new Block(candidate.timestamp, [...candidate.transactions], candidate.previousHash, candidate.difficulty);
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
  // transactions and timestamp stay as they are. Every earlier block must be valid.
  prepareRemine(index, { difficulty = this.miningDifficulty } = {}) {
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
    return {
      success: true,
      candidate: Object.freeze({
        index, previousHash, timestamp: block.timestamp, difficulty, target: '0'.repeat(difficulty), txRoot,
        prefix: previousHash + txRoot + block.timestamp + difficulty
      })
    };
  }

  // Store a re-mining proof. Nothing changes unless the proof is valid and the
  // block, its predecessor and every earlier block are as they were prepared.
  acceptRemine(candidate, nonce, hash) {
    if (hash !== candidateHash(candidate, nonce)) return { status: 'rejected', reason: 'hash-mismatch' };
    if (!hash.startsWith(candidate.target)) return { status: 'rejected', reason: 'target-miss' };
    const block = this.blockArray[candidate.index];
    const broken = this.firstBrokenBlock();
    if (!block || this.blockArray[candidate.index - 1].hash !== candidate.previousHash ||
      transactionRoot(block.transactions) !== candidate.txRoot || (broken !== null && broken < candidate.index)) {
      return { status: 'stale' };
    }
    block.previousHash = candidate.previousHash;
    block.txRoot = candidate.txRoot;
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
      const meetsTarget = storedHash.startsWith('0'.repeat(block.difficulty));
      // Genesis has no predecessor; its link is intact by definition.
      const linkIntact = index === 0 || block.previousHash === this.blockArray[index - 1].hash;
      const { issues } = ledger.blocks[index];
      const signaturesValid = !issues.some(issue => issue.reason === 'signature');
      const builtOnBroken = brokenBefore;
      const status = !hashMatches || !meetsTarget ? 'hash-mismatch'
        : !linkIntact ? 'link-broken'
          : !signaturesValid ? 'signature-invalid'
            : issues.length ? 'transaction-invalid'
              : builtOnBroken ? 'built-on-broken' : 'valid';
      if (status !== 'valid') brokenBefore = true;
      return { index, storedHash, computedHash, hashMatches, meetsTarget, linkIntact, signaturesValid, builtOnBroken, status,
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
    if (!output || !Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY) return false;
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
    participants = ['Alice', 'Bob', 'Chris', 'Lars', 'Minas'],
    miners = ['Minas', 'Lars']
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
