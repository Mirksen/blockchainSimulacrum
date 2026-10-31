/**
 * Blockchain Simulacrum - Browser-compatible ES6 Port
 * Original by Valentic, Mirko (2021, CS50)
 * Ported for modern React web application
 */

import SHA256 from 'crypto-js/sha256';
import { ec as EC } from 'elliptic';
import { deriveWallet } from './wallet';
import genesis from '../../../shared/genesis.json';
import { bitsOfZeros, coinbaseParts, displayHash, headerHex, meetsTarget, merkleRoot, zerosOfTarget } from '../../../shared/bitcoin-block.mjs';
import { BLOCK_VERSION, hashAtNonce, headerPrefix, isNonce, sha256d } from './blockHeader';

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
    this.publicKey = this.keyPair.getPublic('hex');
    this.privateKey = this.keyPair.getPrivate('hex');
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

// Transaction class - transfers between participants
export class Transaction {
  constructor(sender, recipient, amount, transactionFee, referenceNumber) {
    this.sender = sender;
    this.recipient = recipient;
    this.amount = amount;
    this.transactionFee = transactionFee;
    this.referenceNumber = referenceNumber;
    this.signature = null;
    this.timestamp = new Date().toISOString();
  }

  createHash() {
    return SHA256(
      this.sender +
      this.recipient +
      this.amount +
      this.transactionFee +
      this.referenceNumber
    ).toString();
  }

  sign(signingKey) {
    if (signingKey.getPublic('hex') !== this.sender) {
      throw new Error('Signature does not match sender wallet');
    }
    const hashTx = this.createHash();
    const sig = signingKey.sign(hashTx, 'base64');
    this.signature = sig.toDER('hex');
  }

  isValid() {
    if (this.sender === null) return true; // Mining reward
    if (!this.signature || this.signature.length === 0) {
      throw new Error('No signature in this transaction');
    }
    const publicKey = ec.keyFromPublic(this.sender, 'hex');
    return publicKey.verify(this.createHash(), this.signature);
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

// A coinbase in Bitcoin's byte format: the scriptSig pushes bits, extraNonce and memo, the
// output pays `value` to a public key. Its hash is the txid, rebuilt from the current
// amount and memo, so an edit shows.
class Coinbase extends Transaction {
  constructor({ recipient, pubkey, amount, memo, bits, extraNonce = 0, extraNonceBytes = 8 }) {
    super(null, recipient, amount, 0, memo);
    Object.assign(this, { pubkey, bits, extraNonce, extraNonceBytes });
  }

  createHash() {
    const { pubkey, bits, extraNonce, extraNonceBytes } = this;
    const fields = { pubkey, bits, extraNonce, extraNonceBytes, memo: String(this.referenceNumber), value: Math.round(Number(this.amount) * 1e8) };
    try {
      return displayHash(coinbaseParts(fields).hex, sha256d);
    } catch {
      return 'f'.repeat(64);  // an edit the Bitcoin format cannot encode never matches
    }
  }
}

// The one place a block's reward is built. The height in the memo keeps two rewards of
// one miner from sharing a txid.
function rewardCoinbase({ height, value, pubkey, extraNonce, bits }) {
  return new Coinbase({ recipient: pubkey, pubkey, amount: value, memo: `Mining Reward #${height}`, bits, extraNonce });
}

export function createGenesisBlock() {
  const { coinbase, header } = genesis;
  const tx = new Coinbase({ ...coinbase, bits: header.bits });
  tx.timestamp = new Date(header.time * 1000).toISOString();
  const block = new Block(header.time, [tx], genesis.anchor.hash, header.bits);
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

// Blockchain class - the main chain management
export class Blockchain {
  constructor(name, miningDifficulty = 3, blockReward = 3.125, halvingEvent = 210000, startingBalance = 0) {
    this.name = name;
    this.miningDifficulty = miningDifficulty;
    this.blockReward = blockReward;
    this.halvingEvent = halvingEvent;
    this.participants = [];
    this.blockArray = [this.createGenesisBlock()];
    this.memPool = [];
    this.startingBalance = startingBalance;
    this.miningLog = [];
    // Original amounts of tampered transactions, keyed "block:tx"; set once per edit.
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

  // A wallet the learner creates: a non-miner participant whose balance
  // follows the starting balance rule like every other wallet.
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

  // Calculate balance including pending mempool transactions (for validation)
  calculateBalance(publicKey) {
    let balance = this.startingBalance;

    // Include confirmed transactions in blocks
    for (const block of this.blockArray) {
      for (const tx of block.transactions) {
        if (tx.sender === publicKey) {
          balance -= tx.amount;
          balance -= tx.transactionFee;
        }
        if (tx.recipient === publicKey) {
          balance += tx.amount;
        }
      }
    }

    // Also include pending transactions in mempool (for validation only)
    for (const tx of this.memPool) {
      if (tx.sender === publicKey) {
        balance -= tx.amount;
        balance -= tx.transactionFee;
      }
      if (tx.recipient === publicKey) {
        balance += tx.amount;
      }
    }

    const rounded = Math.round(balance * 100000000) / 100000000;
    return rounded === 0 ? 0 : rounded;
  }

  // Calculate confirmed balance only (for display - excludes mempool)
  calculateConfirmedBalance(publicKey) {
    let balance = this.startingBalance;

    // Only include confirmed transactions in blocks
    for (const block of this.blockArray) {
      for (const tx of block.transactions) {
        if (tx.sender === publicKey) {
          balance -= tx.amount;
          balance -= tx.transactionFee;
        }
        if (tx.recipient === publicKey) {
          balance += tx.amount;
        }
      }
    }

    const rounded = Math.round(balance * 100000000) / 100000000;
    return rounded === 0 ? 0 : rounded;
  }

  getAllBalances() {
    return this.participants.map(p => ({
      name: p.name,
      publicKey: p.publicKey,
      balance: this.calculateConfirmedBalance(p.publicKey), // Use confirmed only for display
      isMiner: p.isMiner && p.minerEnabled
    }));
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

    const balance = this.calculateBalance(sender.publicKey);
    const required = Math.round(amount * 1e8) + Math.round(transactionFee * 1e8);
    if (Math.round(balance * 1e8) < required) {
      throw new Error(`Insufficient funds. Balance: ${balance}, Required: ${required / 1e8}`);
    }

    const tx = new Transaction(
      sender.publicKey,
      recipient.publicKey,
      amount,
      transactionFee,
      reference
    );

    tx.sign(sender.keyPair);
    this.memPool.push(tx);

    return tx;
  }

  // A header's time may equal its predecessor's, never run behind it.
  nextBlockTime() {
    return Math.max(Math.floor(Date.now() / 1000), this.blockArray.at(-1).time);
  }

  // Freeze the work for one miner: everything except the nonce is fixed here, so a
  // search only varies the last four header bytes. A further extraNonce changes the
  // coinbase and with it the root, which opens a fresh nonce space.
  prepareCandidate(miner, { time = this.nextBlockTime(), extraNonce = 0 } = {}) {
    const height = this.blockArray.length;
    const reward = height % this.halvingEvent === 0 ? this.blockReward / 2 : this.blockReward;
    const fees = this.memPool.reduce((sum, tx) => sum + tx.transactionFee, 0);
    const difficulty = this.miningDifficulty;
    const bits = bitsOfZeros(difficulty);
    const coinbase = rewardCoinbase({ height, value: reward + fees, pubkey: miner.publicKey, extraNonce, bits });
    const transactions = Object.freeze([coinbase, ...this.memPool]);
    const previousHash = this.blockArray[height - 1].hash;
    const txRoot = transactionRoot(transactions);
    return Object.freeze({
      previousHash,
      time,
      difficulty,
      bits,
      extraNonce,
      reward,
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
    this.blockArray.push(block);
    this.memPool = [];
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
  // and link are fine but a signed transaction no longer matches its signature
  // (re-mining repairs hashes, never signatures); `built-on-broken` when the
  // block itself is fine but an earlier block is broken; otherwise `valid`.
  inspectBlocks() {
    let brokenBefore = false;
    return this.blockArray.map((block, index) => {
      const storedHash = block.hash;
      const computedHash = block.createHash();
      const hashMatches = storedHash === computedHash;
      const hashMeetsTarget = meetsTarget(storedHash, block.bits);
      // Genesis has no predecessor; its link is intact by definition.
      const linkIntact = index === 0 || block.previousHash === this.blockArray[index - 1].hash;
      const signaturesValid = block.transactions.every(tx => { try { return tx.isValid(); } catch { return false; } });
      const builtOnBroken = brokenBefore;
      const status = !hashMatches || !hashMeetsTarget ? 'hash-mismatch'
        : !linkIntact ? 'link-broken'
          : !signaturesValid ? 'signature-invalid'
            : builtOnBroken ? 'built-on-broken' : 'valid';
      if (status !== 'valid') brokenBefore = true;
      return { index, storedHash, computedHash, hashMatches, meetsTarget: hashMeetsTarget, linkIntact, signaturesValid, builtOnBroken, status };
    });
  }

  // Index of the first block whose status is not `valid`, or null.
  firstBrokenBlock() {
    return this.inspectBlocks().find(check => check.status !== 'valid')?.index ?? null;
  }

  areTransactionsValid() {
    for (const block of this.blockArray) {
      for (const tx of block.transactions) {
        if (!tx.isValid()) return false;
      }
    }
    return true;
  }

  isChainValid() {
    return this.areBlocksValid() && this.areTransactionsValid() && this.areBalancesValid();
  }

  areBalancesValid() {
    const balances = {};

    for (const block of this.blockArray) {
      // Validate Block Logic (Optional: balances must be consistent)
      for (const tx of block.transactions) {
        // Debit Sender
        if (tx.sender) {
          const senderBalance = (balances[tx.sender] || 0) + this.startingBalance;
          const required = Math.round(tx.amount * 1e8) + Math.round(tx.transactionFee * 1e8);
          if (Math.round(senderBalance * 1e8) < required) {
            return false; // Insufficient funds
          }
          balances[tx.sender] = (Math.round((balances[tx.sender] || 0) * 1e8) - required) / 1e8;
        }

        // Credit Recipient
        if (tx.recipient) {
          balances[tx.recipient] = (Math.round((balances[tx.recipient] || 0) * 1e8) + Math.round(tx.amount * 1e8)) / 1e8;
        }
      }
    }
    return true;
  }

  // Tamper with a transaction (for demo purposes)
  // The first edit of a transaction remembers its original amount; setting the
  // original amount again ends the edit.
  tamperTransaction(blockIndex, txIndex, newAmount) {
    if (this.blockArray[blockIndex] && this.blockArray[blockIndex].transactions[txIndex]) {
      const tx = this.blockArray[blockIndex].transactions[txIndex];
      const key = `${blockIndex}:${txIndex}`;
      if (!this.tamperedOriginals.has(key)) this.tamperedOriginals.set(key, { blockIndex, txIndex, amount: tx.amount });
      tx.amount = newAmount;
      this.historyEdited = true;
      if (this.tamperedOriginals.get(key).amount === newAmount) this.tamperedOriginals.delete(key);
      return true;
    }
    return false;
  }

  // Restore the original amounts of every edited transaction in one block.
  undoTamper(blockIndex) {
    let restored = 0;
    for (const [key, edit] of this.tamperedOriginals) {
      if (edit.blockIndex !== blockIndex) continue;
      this.blockArray[edit.blockIndex].transactions[edit.txIndex].amount = edit.amount;
      this.tamperedOriginals.delete(key);
      this.historyEdited = true;
      restored++;
    }
    return { success: restored > 0, restored };
  }

  // Current edits, ordered by block and transaction: amount `from` → `to`.
  getTamperedEdits() {
    return [...this.tamperedOriginals.values()]
      .map(({ blockIndex, txIndex, amount }) => ({ blockIndex, txIndex, from: amount,
        to: this.blockArray[blockIndex].transactions[txIndex].amount }))
      .sort((a, b) => a.blockIndex - b.blockIndex || a.txIndex - b.txIndex);
  }

  // Get block details
  getBlockDetails(index) {
    return this.blockArray[index] || null;
  }

  // Get transaction history for a participant
  getTransactionHistory(publicKey) {
    const history = [];
    for (let i = 0; i < this.blockArray.length; i++) {
      const block = this.blockArray[i];
      for (const tx of block.transactions) {
        if (tx.sender === publicKey || tx.recipient === publicKey) {
          history.push({
            blockIndex: i,
            ...tx
          });
        }
      }
    }
    return history;
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
    miners = ['Minas', 'Lars'],
    startingBalance = 0
  } = config;

  const blockchain = new Blockchain(name, miningDifficulty, blockReward, halvingEvent, startingBalance);

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
