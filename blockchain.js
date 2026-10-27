/*
// * Created by  :    Valentic, Mirko
// * on          :    2021, CS50
// * Project     :    blockchain simulacrum
// *
// * Content     :    Building a Blockchain with Proof-of-work mechanism
// *
// *********************************************************************
// * Change History:
// * Author      Date      Change
// *----------------------------------------------------------
// *Valentic, Mirko  07.06.2021    first version release
// *Valentic, Mirko  07.06.2021    added transaction signatures to avoid that anyone can make any transactions
// *Valentic, Mirko  09.06.2021    added Participant class
// *Valentic, Mirko  11.06.2021    complete code rewriting for dynamization
// *Valentic, Mirko  21.06.2021    major security re-conceptiopn
*/

const { createHash } = require("node:crypto");
const SHA256 = (value) => createHash("sha256").update(value).digest("hex");
const EC = require("elliptic").ec; // importing signature module for transaction sign
const ec = new EC("secp256k1"); // we pick Elliptic:secp256k1 - it refers to the parameters of the elliptic curve and defines its standard attributes defined in SEC
const config = require("./config");

// Use integer smallest units for validation, balances and fee accounting.
const COIN = 100000000;
function moneyUnits(value, label = "Transaction amount") {
  const units = Math.round(value * COIN);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      !Number.isSafeInteger(units) || units / COIN !== value) {
    throw new Error(`${label} must be a finite nonnegative number with at most 8 decimals.`);
  }
  return units;
}
function checkDifficulty(value) {
  if (!Number.isInteger(value) || value < 0 || value > 64) {
    throw new Error("Mining difficulty must be an integer between 0 and 64.");
  }
}
function safeSum(a, b) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("Money exceeds the safe numeric range.");
  return result;
}
function copyTransaction(tx) {
  const copy = new Transaction(tx.sender, tx.recipient, tx.amount, tx.transactionFee, tx.referenceNumber);
  copy.signature = tx.signature;
  return copy;
}

// Particpants are the ledger's members possesing a wallet, beeing able to receive,sign & send transactions (a participant can be declared a miner "on top", actively adding transactions to the blockchain)
class Participant {
  constructor(name) {
    this.name = name;
    this.keyPair = this.createKeypair();
    this.publicKey = this.derivePublicKey(); // equals receiving address
    this.privateKey = this.derivePrivateKey(); // equals a password
    this.activeMiner = false; // miner flag
  }

  // create a cryptographic key pair
  createKeypair = () => {
    const keyPair = ec.genKeyPair();
    return keyPair;
  };
  // get the seperate public key out of the pair
  derivePublicKey = () => {
    const pubKey = this.keyPair.getPublic("hex");
    return pubKey;
  };
  // get the seperate private key out of the pair
  derivePrivateKey = () => {
    const privKey = this.keyPair.getPrivate("hex");
    return privKey;
  };
}

// Transactions are transmissions of a specific amount of krypto assets (UTXO) from a sender to a recipient or as reward for a successful mining process
class Transaction {
  constructor(sender, recipient, amount, transactionFee, referenceNumber) {
    this.sender = sender;
    this.recipient = recipient;
    this.amount = amount;
    this.transactionFee = transactionFee; // the fee paid to the miner for his work
    this.referenceNumber = referenceNumber; // freely choosable reference for transaction labeling
  }

  // we create a unique hash (fingerprint-like identifier) for the specific transaction
  createHash = () => {
    return SHA256(JSON.stringify([
      this.sender, this.recipient, this.amount, this.transactionFee, this.referenceNumber,
    ]));
  };

  // the previous hash together with our private key resulting in a unique Signature, proofing the ownership of the wallet to verify transactions in the ledger, otherwise the transaction will be rejected
  sign = (signingKey) => {
    if (signingKey.getPublic("hex") !== this.sender) {
      // checks if the signature matches the myPublicKey
      throw new Error(
        "The signature of this transaction is not correct ==> transaction rejected"
      );
    }
    const hashTx = this.createHash();
    const sig = signingKey.sign(hashTx, "base64"); // we sign the hash of our transaction, afterwards encoding the data to hex/base64 format
    this.signature = sig.toDER("hex"); // defining blocks' signature and declaring hex-format via parameter
  };

  // transaction validity check
  isValid() {
    try {
      const amount = moneyUnits(this.amount);
      moneyUnits(this.transactionFee, "Transaction fee");
      if (typeof this.recipient !== "string" || !this.recipient ||
          typeof this.referenceNumber !== "string") return false;
      if (this.sender === null) return this.transactionFee === 0;
      if (amount === 0 || typeof this.sender !== "string" || !this.signature) return false;
      const publicKey = ec.keyFromPublic(this.sender, "hex");
      return publicKey.validate().result && publicKey.verify(this.createHash(), this.signature);
    } catch {
      return false;
    }
  }
}

// a Block is a group of transactions from the mempool beeing verified in the mining process and appended to the blockchain
class Block {
  constructor(timestamp, transactions, previousHash = "") {
    // previous set to empty as standard
    this.timestamp = timestamp; // Date().toLocaleString()
    this.transactions = transactions;
    this.previousHash = previousHash; // hash value of the previous block
    this.nonce = 0; // nonce = "number used once" - starting by 0 and iterated  +1 per guess to find the X-Zero-Hash. The final number will be totally random and not be calculatable in advance since the SHA256 algorithm hasn't been reverse-engineered until now.
    this.hash = this.createHash(); // create new block hash value
  }

  // combine all data of the Block and calculate a 256bit fingerprint-like hash on it to undoubtly identify the block's integrity
  createHash = () => {
    return SHA256(
      this.previousHash +
        this.timestamp +
        JSON.stringify(this.transactions) +
        this.nonce
    ).toString();
  };

  // Proof-of-work: to avoid tampering by cheaply recalculating the whole blockchain's hashes and therefore beeing valid again we add another security layer by extending the creation time a lot by this simple condition to match an X-amount of starting Zeros in the hash, until the desired time distances between block creation being matched. Resources in form of computing power and time have to be committed and spent
  searchXZeroHash = (miningDifficulty) => {
    checkDifficulty(miningDifficulty);
    this.hash = this.createHash();
    let startTime = Date.now();
    while (
      this.hash.substring(
        0,
        miningDifficulty
      ) /* <= checks the first+X hash characters */ !==
      Array(miningDifficulty + 1).join("0")
    ) {
      // against a string of "0s" calculated by an empty array in the size of the diffculty+1 resulting in concatenating those empty values with "0" in zeros resulting in "0000" for diffuculty = 4 (join()method returns array as string). Iterating until the minimal amount of Zeros (mining Difficulty) beeing matched
      if (config.miningLog == true) {
        console.log(
          `block: ${config.blockCounter + 1} nonce: ${this.nonce} hash: ${
            this.hash
          }`
        );
      }
      this.nonce++; // nonce getting increased by 1 in while loop until the previous condition of minimal amount of starting zeros is beeing met (Bitcoin using a 2nd nonce field already, since the scale is so big, that one nounce field is not sufficient because of overflow)
      this.hash = this.createHash(); // using   hashcalculation until finding the desired X-Zero-Hash according to the loop condition
    }
    let endTime = Date.now();
    let timeDiff = endTime - startTime;
    // strip the ms
    timeDiff /= 1000;
    timeDiff.toString();
    config.miningTimes.push(timeDiff);
    // start counting block numbers
    config.blockCounter++;
    config.blockHashes.push(this.hash);
    console.log(
      `\n==> #${config.blockCounter} Block sucessfully mined with \nnonce: ${this.nonce} hash: ${this.hash}`
    );
    if (config.miningLog == true) {
      // count block hashing attempts
      let counter = 1;
      console.log(`Completing nonce is ${this.nonce} passed in ${timeDiff}\n`);
      console.log(
        `............................................................................`
      );
      console.log(
        `MINING LOG \ndifficulty of - ${config.miningDifficulty} - leading zeros:`
      );
      for (const timeDiff of config.miningTimes) {
        console.log(`#${counter++} block mining time: ${timeDiff}`);
      }
      console.log(`\nproof-of-work hashes: \n${config.blockHashes.join(`\n`)}`);
      console.log(
        `............................................................................`
      );
    }
  };

  // Blockchain Security against tamper approaches
  isValid = () => {
    if (this.hash !== this.createHash()) {
      // hash comparison
      return false;
    }
    return true;
  };
}

// a Blockchain is an array of Blocks with each block pointing to the hash of the previous block
class Blockchain {
  #startingBalanceUnits;
  #initialRewardUnits;

  constructor(name, miningDifficulty, blockreward, halvingEvent) {
    checkDifficulty(miningDifficulty);
    this.#initialRewardUnits = moneyUnits(blockreward, "Block reward");
    this.#startingBalanceUnits = moneyUnits(config.startingBalance, "Starting balance");
    if (!Number.isSafeInteger(halvingEvent) || halvingEvent <= 0) {
      throw new Error("Halving interval must be a positive safe integer.");
    }
    this.name = name; // blockchain identifier to be chosen freely
    this.participants = []; // participants can be wallet owners or miners
    this.blockArray = [this.createFirstBlock()]; // array of blocks starting with the Genesis Block to have a starting anchor (main difference it has no "previous block hash value")
    this.miningDifficulty = miningDifficulty; // the artificial added difficulty level which is growing exponentially by each incremental increase due to the nature demanding more specific hash structures. Target extends or shortens the block creation time to control how fast blocks can be added to the blockchain - Unsufficient strong difficulty means that a spammer can create lots of fake blocks or even recreate the whole chain itself. Remember that this difficulty is fixed while in Bitcoin there is an adjustment every 2016 blocks to keep the 10 min block creation period in place
    this.memPool = []; // broadcastet transactions going here
    this.blockReward = blockreward; // successfully appending a block to the blockchain rewards the miner with this amount. While Bitcoin started with "50" as initial reward, we take "6.25" as the recent value as start value
    this.halvingEvent = halvingEvent; // every nth Block the mining reward getting halved. While Bitcoin adjusts the blockreward every 210000 blocks, we chose 2 to show the effect immidiately in our short deployment
    this.transactionCounter = 0;
  }

  // get participants, otherwise show error message if there are none
  get members() {
    return this.participants || "No Participants";
  }
  // create new participants handed over by an array parameter
  set members(names) {
    if (!Array.isArray(names) || this.participants.length !== 0) {
      throw new Error("Initialize participants once; use addParticipants to add more.");
    }
    this.addParticipants(...names);
  }

  participant = (name) => {
    const participant = this.participants.find((entry) => entry.name === name);
    if (!participant) throw new Error(`Unknown participant: ${name}`);
    return participant;
  };

  //  The first block of a blockchain is also called the "Genesis Block" and has to be created artifially (Not getting calculated by mining)
  createFirstBlock = () => {
    return new Block("Genesis Block", [], "There is no previous Hash."); // getting filled with dummy data: there is no previous hash for the first block
  };

  // declaring all ledger participants and print the members
  addParticipants = (...names) => {
    const known = new Set(this.participants.map((entry) => entry.name));
    for (const name of names) {
      if (typeof name !== "string" || !name.trim() || known.has(name)) {
        throw new Error("Participant names must be nonempty and unique.");
      }
      known.add(name);
    }
    const additions = names.map((name) => new Participant(name));
    this.participants.push(...additions);
    console.log(`\n-=NEW BLOCKCHAIN: ${this.name}-=-`);
    for (const participant of additions) {
      console.log(`     participant joined: ${participant.name}\n          publickey: ${participant.publicKey}`);
    }
  };

  setMiner = (...names) => {
    const miners = names.map((name) => this.participant(name));
    for (const miner of miners) {
      miner.activeMiner = true;
      console.log(`        Miner declared: ${miner.name}`);
    }
  };

  // function to reaveal the full ledger in JSON-format
  showFullLedger = () => {
    console.log(`\n${this.name} full ledger:`);
    console.log(JSON.stringify(this.blockArray, null, 4));
  };

  // user balance: you do not really have stored a concrete balance on your account or a single block but everytime you want to see your balance you have to scan the whole blockchain(=ledger)
  calculateBalance = (myPublicKey) => {
    let balance = this.#startingBalanceUnits;
    for (const block of this.blockArray) {
      for (const tx of block.transactions) {
        if (tx.sender === myPublicKey) {
          balance = safeSum(balance, -safeSum(moneyUnits(tx.amount), moneyUnits(tx.transactionFee)));
        }
        if (tx.recipient === myPublicKey) balance = safeSum(balance, moneyUnits(tx.amount));
      }
    }
    return balance / COIN;
  };

  // checking the full ledger to get all participants most recent balance
  calculateBalanceAll = () => {
    console.log(
      `............................................................................`
    );
    console.log(`USER BALANCES`);
    for (let i in this.participants) {
      console.log(
        `     ${this.participants[i].name} : ${this.calculateBalance(
          this.participants[i].publicKey
        )}`
      );
    }
    console.log(
      `............................................................................`
    );
  };

  // creating a new Transaction with given input parameters and append it to the Blockchain mempool
  createTx = (
    signaturer,
    sender,
    recipient,
    amount,
    transactionFee,
    referenceNumber
  ) => {
    const signer = this.participant(signaturer);
    const from = this.participant(sender);
    const to = this.participant(recipient);
    const tx = new Transaction(
      from.publicKey,
      to.publicKey,
      amount,
      transactionFee,
      referenceNumber
    );
    tx.sign(signer.keyPair);
    this.appendTx(tx);
    this.transactionCounter++;
    console.log(
      `NEW TRANSACTION #${
        this.transactionCounter
      }:\n     "${sender}" is sending - ${amount} ${
        this.name
      } - to "${recipient}"\n     Reference: ${referenceNumber}\n     transaction fee: ${transactionFee.toFixed(
        8
      )} ${this.name}\n     ==>transaction signature verified`
    );
    console.log(
      `..................................................................................................................................................................`
    );
  };

  // receive the new transaction and add it to the memPool array
  appendTx = (transaction) => {
    const tx = copyTransaction(transaction);
    this.validateTransfer(tx);
    const hash = tx.createHash();
    if (this.memPool.some((pending) => pending.createHash() === hash) ||
        this.blockArray.some((block) => block.transactions.some((old) => old.sender !== null && old.createHash() === hash))) {
      throw new Error("Duplicate transaction.");
    }
    const reserved = this.memPool.filter((pending) => pending.sender === tx.sender)
      .reduce((sum, pending) => safeSum(sum, safeSum(moneyUnits(pending.amount), moneyUnits(pending.transactionFee))), 0);
    const spend = safeSum(moneyUnits(tx.amount), moneyUnits(tx.transactionFee));
    if (moneyUnits(this.calculateBalance(tx.sender)) - reserved < spend) {
      throw new Error("Insufficient funds including fees and pending transactions.");
    }
    this.memPool.push(tx);
  };

  validateTransfer = (tx) => {
    if (tx.sender === null || !tx.isValid() ||
        !this.participants.some((p) => p.publicKey === tx.sender) ||
        !this.participants.some((p) => p.publicKey === tx.recipient)) {
      throw new Error("Transaction is not valid; check participants, amount, fee and signature.");
    }
  };

  subsidyUnits = (height) => Math.floor(this.#initialRewardUnits / 2 ** Math.floor(height / this.halvingEvent));

  // Replay transfers in order and validate each block's sole coinbase against its subsidy and fees.
  replayTransactions = () => {
    const balances = new Map(this.participants.map((p) => [p.publicKey, this.#startingBalanceUnits]));
    const seen = new Set();
    if (!Array.isArray(this.blockArray[0]?.transactions) || this.blockArray[0].transactions.length !== 0) {
      throw new Error("Invalid genesis transactions.");
    }
    for (let height = 1; height < this.blockArray.length; height++) {
      const transactions = this.blockArray[height].transactions;
      if (!Array.isArray(transactions) || transactions.length === 0) throw new Error("Missing mining reward.");
      let fees = 0;
      for (const tx of transactions.slice(0, -1)) {
        this.validateTransfer(tx);
        const hash = tx.createHash();
        if (seen.has(hash)) throw new Error("Duplicate transaction.");
        seen.add(hash);
        const fee = moneyUnits(tx.transactionFee);
        const spend = safeSum(moneyUnits(tx.amount), fee);
        if (balances.get(tx.sender) < spend) throw new Error("Insufficient funds.");
        balances.set(tx.sender, balances.get(tx.sender) - spend);
        balances.set(tx.recipient, safeSum(balances.get(tx.recipient), moneyUnits(tx.amount)));
        fees = safeSum(fees, fee);
      }
      const reward = transactions.at(-1);
      if (!reward || reward.sender !== null || !reward.isValid() || !balances.has(reward.recipient) ||
          moneyUnits(reward.amount) !== safeSum(this.subsidyUnits(height), fees)) {
        throw new Error("Invalid mining reward.");
      }
      balances.set(reward.recipient, safeSum(balances.get(reward.recipient), moneyUnits(reward.amount)));
    }
    return { balances, seen };
  };

  // mining function including status printing: creating a new candidate block including the validated transactions from the mempool and start the mining process for the X-Zero-Hash
  miningProcess = (miningRewardAddress) => {
    checkDifficulty(this.miningDifficulty);
    if (!this.participants.some((p) => p.publicKey === miningRewardAddress && p.activeMiner)) {
      throw new Error("A declared miner participant is required.");
    }
    if (!this.areBlocksValid()) throw new Error("Cannot mine on an invalid blockchain.");
    const { balances, seen } = this.replayTransactions();
    const pending = this.memPool.map(copyTransaction);
    let fees = 0;
    for (const tx of pending) {
      this.validateTransfer(tx);
      const hash = tx.createHash();
      if (seen.has(hash)) throw new Error("Duplicate transaction.");
      seen.add(hash);
      const fee = moneyUnits(tx.transactionFee);
      const spend = safeSum(moneyUnits(tx.amount), fee);
      if (balances.get(tx.sender) < spend) throw new Error("Insufficient funds.");
      balances.set(tx.sender, balances.get(tx.sender) - spend);
      balances.set(tx.recipient, safeSum(balances.get(tx.recipient), moneyUnits(tx.amount)));
      fees = safeSum(fees, fee);
    }
    const subsidy = this.subsidyUnits(this.blockArray.length);
    const totalReward = safeSum(subsidy, fees);
    safeSum(balances.get(miningRewardAddress), totalReward);
    const reward = new Transaction(null, miningRewardAddress, totalReward / COIN, 0, "Mining Compensation");
    const block = new Block(new Date().toISOString(), [...pending, reward], this.blockArray.at(-1).hash);
    console.log(` initializing #${this.blockArray.length} Block:`);
    console.log(`   ...appending all pending transactions: ${pending.map((tx) => tx.referenceNumber)}`);
    console.log(`   ...block subsidy: ${subsidy / COIN}; transaction fees: ${(fees / COIN).toFixed(8)}`);
    console.log(`   ...searching for ${this.miningDifficulty} leading zeros`);
    block.searchXZeroHash(this.miningDifficulty);
    this.blockArray.push(block);
    this.blockReward = subsidy / COIN;
    this.memPool = [];
  };

  // function to trigger the mining process which grabs all transactions, finds the correct hash and appends it to the blockchain
  mineNextBlock = () => {
    const miner = this.participants.find((participant) => participant.activeMiner);
    if (!miner) throw new Error("A declared miner participant is required.");
    console.log(`MINING\nMiner-${miner.name} is starting a mining process ...`);
    this.miningProcess(miner.publicKey);
    console.log(
      `\n***...Broadcasting the newest ${this.name} block to the network***`
    );
    console.log(
      `***...network validation: Chain validity is ${
        !this.areBlocksValid() || !this.areTxValid() ? "broken" : "given"
      }***`
    ); // security checkup
  };

  // if we want to check one's transaction history
  showTxHistory = (myPublicKey) => {
    const txs = [];
    for (const block of this.blockArray) {
      for (const tx of block.transactions) {
        if (tx.sender === myPublicKey || tx.recipient === myPublicKey) {
          txs.push(tx);
        }
      }
    }
    // return txs
    return JSON.stringify(txs, null, 4);
    // console.log(`\n${name} transaction history: ${this.showTxHistory(this.articipants[this.participants.findIndex(x => x.name === name)].publicKey)}`) // print history
  };

  // reveal the full transaction history of a single participant
  checkWallet = (name) => {
    console.log(`\n${name} transaction history: ${this.showTxHistory(this.participant(name).publicKey)}`);
  };

  // validity check for blocks
  areBlocksValid = () => {
    try {
      checkDifficulty(this.miningDifficulty);
      if (JSON.stringify(this.createFirstBlock()) !== JSON.stringify(this.blockArray[0])) return false;
      for (let height = 1; height < this.blockArray.length; height++) {
        const block = this.blockArray[height];
        if (!block.isValid() || block.previousHash !== this.blockArray[height - 1].hash ||
            !Number.isSafeInteger(block.nonce) || block.nonce < 0 ||
            !block.hash.startsWith("0".repeat(this.miningDifficulty))) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  areTxValid = () => {
    try {
      this.replayTransactions();
      return true;
    } catch {
      return false;
    }
  };

}
module.exports.Blockchain = Blockchain; //export to be consumed in main
