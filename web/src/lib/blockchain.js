/**
 * Blockchain Simulacrum - Browser-compatible ES6 Port
 * Original by Valentic, Mirko (2021, CS50)
 * Ported for modern React web application
 */

import SHA256 from 'crypto-js/sha256';
import { ec as EC } from 'elliptic';

const ec = new EC('secp256k1');

// Participant class - wallet owners with cryptographic key pairs
export class Participant {
  constructor(name) {
    this.name = name;
    this.keyPair = ec.genKeyPair();
    this.publicKey = this.keyPair.getPublic('hex');
    this.privateKey = this.keyPair.getPrivate('hex');
    this.activeMiner = false;
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

// Block class - container for transactions
export class Block {
  constructor(timestamp, transactions, previousHash = '') {
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.createHash();
  }

  createHash() {
    return SHA256(
      this.previousHash +
      this.timestamp +
      JSON.stringify(this.transactions) +
      this.nonce
    ).toString();
  }

  // Async mining with progress callback for UI updates
  // Returns hash attempts array for visualization
  async mineBlock(difficulty, onProgress, onAttempt, shouldAbort) {
    const target = Array(difficulty + 1).join('0');
    const startTime = Date.now();
    let iterations = 0;
    const attempts = [];

    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.createHash();
      iterations++;

      // Record every attempt for visualization (limit to last 50 for performance)
      if (onAttempt) {
        onAttempt({ nonce: this.nonce, hash: this.hash });
      }

      // Call progress callback every 50 iterations for UI update
      if (iterations % 50 === 0) {
        if (shouldAbort && shouldAbort()) {
          return { aborted: true, nonce: this.nonce, hash: this.hash, iterations, miningTime: (Date.now() - startTime) / 1000 };
        }
        if (onProgress) {
          await onProgress({
            nonce: this.nonce,
            hash: this.hash,
            iterations,
            elapsedMs: Date.now() - startTime
          });
          // Yield to UI thread
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

    }

    const miningTime = (Date.now() - startTime) / 1000;
    return { nonce: this.nonce, hash: this.hash, miningTime, iterations };
  }

  isValid() {
    return this.hash === this.createHash();
  }
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

  addParticipant(name) {
    const participant = new Participant(name);
    this.participants.push(participant);
    return participant;
  }

  getParticipantByName(name) {
    return this.participants.find(p => p.name === name);
  }

  setMiner(name) {
    const participant = this.getParticipantByName(name);
    if (participant) {
      participant.activeMiner = true;
    }
    return participant;
  }

  getActiveMiner() {
    return this.participants.find(p => p.activeMiner);
  }

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

    // Also include pending transactions in mempool
    for (const tx of this.memPool) {
      if (tx.sender === publicKey) {
        balance -= tx.amount;
        balance -= tx.transactionFee;
      }
      if (tx.recipient === publicKey) {
        balance += tx.amount;
      }
    }

    return Math.round(balance * 100000000) / 100000000;
  }

  getAllBalances() {
    return this.participants.map(p => ({
      name: p.name,
      publicKey: p.publicKey,
      balance: this.calculateBalance(p.publicKey),
      isMiner: p.activeMiner
    }));
  }

  createTransaction(senderName, recipientName, amount, transactionFee, reference) {
    const sender = this.getParticipantByName(senderName);
    const recipient = this.getParticipantByName(recipientName);

    if (!sender || !recipient) {
      throw new Error('Sender or recipient not found');
    }

    const balance = this.calculateBalance(sender.publicKey);
    if (balance < amount + transactionFee) {
      throw new Error(`Insufficient funds. Balance: ${balance}, Required: ${amount + transactionFee}`);
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

  // Async mining with progress callbacks and hash attempt logging
  // allowEmpty enables mining blocks with only the reward transaction
  async mineNextBlock(onProgress, onAttempt, allowEmpty = false, shouldAbort) {
    const miner = this.getActiveMiner();
    if (!miner) {
      throw new Error('No active miner set');
    }

    if (this.memPool.length === 0 && !allowEmpty) {
      throw new Error('No transactions in mempool to mine');
    }

    // Calculate rewards
    const currentBlockNumber = this.blockArray.length;
    let reward = this.blockReward;

    // Apply halving
    if (currentBlockNumber > 0 && currentBlockNumber % this.halvingEvent === 0) {
      reward = this.blockReward / 2;
      this.blockReward = reward;
    }

    const transactionFees = this.memPool.reduce((sum, tx) => sum + tx.transactionFee, 0);
    const totalReward = reward + transactionFees;

    // Create coinbase transaction
    const rewardTx = new Transaction(null, miner.publicKey, totalReward, 0, 'Mining Reward');
    const transactions = [...this.memPool, rewardTx];

    // Create new block
    const previousHash = this.blockArray[this.blockArray.length - 1].hash;
    const block = new Block(Date.now(), transactions, previousHash);

    // Mine the block with attempt logging
    const result = await block.mineBlock(this.miningDifficulty, onProgress, onAttempt, shouldAbort);

    if (result.aborted) {
      return { success: false, aborted: true };
    }

    // Add to chain
    this.blockArray.push(block);

    // Clear mempool
    this.memPool = [];

    // Log mining result
    this.miningLog.push({
      blockNumber: currentBlockNumber,
      ...result
    });

    return { block, result, reward: totalReward };
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
          if (senderBalance < tx.amount + tx.transactionFee) {
            return false; // Insufficient funds
          }
          balances[tx.sender] = (balances[tx.sender] || 0) - tx.amount - tx.transactionFee;
        }

        // Credit Recipient
        if (tx.recipient) {
          balances[tx.recipient] = (balances[tx.recipient] || 0) + tx.amount;
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
    participants = ['Mirksen', 'Kate', 'Bill', 'Chris', 'Minas'],
    miner = 'Minas',
    startingBalance = 0
  } = config;

  const blockchain = new Blockchain(name, miningDifficulty, blockReward, halvingEvent, startingBalance);

  participants.forEach(name => blockchain.addParticipant(name));
  blockchain.setMiner(miner);

  return blockchain;
}
