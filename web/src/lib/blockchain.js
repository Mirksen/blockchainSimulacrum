/**
 * Blockchain Simulacrum - Browser-compatible ES6 Port
 * Original by Valentic, Mirko (2021, CS50)
 * Ported for modern React web application
 */

import SHA256 from 'crypto-js/sha256';
import { ec as EC } from 'elliptic';
import { deriveWallet } from './wallet';

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

// Merkle root of a transaction list (Bitcoin-style): each leaf is the
// transaction hash, each parent is SHA256(left + right), an odd level repeats
// its last hash, and an empty list has an all-zero root.
const EMPTY_ROOT = '0'.repeat(64);

function transactionLeaf(tx) {
  if (typeof tx.createHash === 'function') return tx.createHash();
  return SHA256(tx.sender + tx.recipient + tx.amount + tx.transactionFee + tx.referenceNumber).toString();
}

export function transactionRoot(transactions) {
  if (transactions.length === 0) return EMPTY_ROOT;
  let level = transactions.map(transactionLeaf);
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

// Hash of a candidate block at a given nonce; equals Block.createHash for the
// block that acceptBlock builds from the same candidate and nonce.
export function candidateHash(candidate, nonce) {
  return SHA256(candidate.prefix + nonce).toString();
}

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
  }

  createGenesisBlock() {
    return new Block(Date.now(), [], '0');
  }

  addParticipant(name, isMiner = false) {
    const participant = new Participant(name, isMiner);
    this.participants.push(participant);
    return participant;
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

  // Freeze the work for one miner: everything except the nonce is fixed here,
  // so a search only varies the nonce appended to `prefix`.
  prepareCandidate(miner, { timestamp = Date.now() } = {}) {
    const height = this.blockArray.length;
    const reward = height % this.halvingEvent === 0 ? this.blockReward / 2 : this.blockReward;
    const fees = this.memPool.reduce((sum, tx) => sum + tx.transactionFee, 0);
    const transactions = Object.freeze([
      ...this.memPool,
      new Transaction(null, miner.publicKey, reward + fees, 0, 'Mining Reward')
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
    this.blockArray.push(block);
    this.memPool = [];
    this.blockReward = candidate.reward;
    this.incrementBlocksWon(candidate.minerPublicKey);
    this.miningLog.push({ blockNumber: candidate.height, nonce, hash });
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
  tamperTransaction(blockIndex, txIndex, newAmount) {
    if (this.blockArray[blockIndex] && this.blockArray[blockIndex].transactions[txIndex]) {
      this.blockArray[blockIndex].transactions[txIndex].amount = newAmount;
      return true;
    }
    return false;
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
    name = 'powCoin',
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
