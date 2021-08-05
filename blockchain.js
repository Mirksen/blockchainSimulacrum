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

const SHA256 = require('crypto-js/sha256') // SHA256 algorithm implemanation, also used in Bitcoin
const EC = require('elliptic').ec // importing signature module for transaction sign
const ec = new EC('secp256k1') // we pick Elliptic:secp256k1 - it refers to the parameters of the elliptic curve and defines its standard attributes defined in SEC
const config = require('./config')

// Particpants are the ledger's members possesing a wallet, beeing able to receive,sign & send transactions (a participant can be declared a miner "on top", actively adding transactions to the blockchain)
class Participant {
  constructor(name) {
    this.name = name
    this.keyPair = this.createKeypair()
    this.publicKey = this.derivePublicKey() // equals receiving address
    this.privateKey = this.derivePrivateKey() // equals a password
    this.activeMiner = false // miner flag
  }

  // create a cryptographic key pair
  createKeypair = () => {
    const keyPair = ec.genKeyPair()
    return keyPair
  }
  // get the seperate public key out of the pair
  derivePublicKey = () => {
    const pubKey = this.keyPair.getPublic('hex')
    return pubKey
  }
  // get the seperate private key out of the pair
  derivePrivateKey = () => {
    const privKey = this.keyPair.getPrivate('hex')
    return privKey
  }
}

// Transactions are transmissions of a specific amount of krypto assets (UTXO) from a sender to a recipient or as reward for a successful mining process
class Transaction {
  constructor(sender, recipient, amount, transactionFee, referenceNumber) {
    this.sender = sender
    this.recipient = recipient
    this.amount = amount
    this.transactionFee = transactionFee // the fee paid to the miner for his work
    this.referenceNumber = referenceNumber // freely choosable reference for transaction labeling
  }

  // we create a unique hash (fingerprint-like identifier) for the specific transaction
  createHash = () => {
    return SHA256(this.sender + this.recipient + this.amount + this.transactionFee + this.referenceNumber).toString()  // adding all values and convert them to a string as SHA256 function parameter
  }

  // the previous hash together with our private key resulting in a unique Signature, proofing the ownership of the wallet to verify transactions in the ledger, otherwise the transaction will be rejected
  sign = signingKey => {
    if (signingKey.getPublic('hex') !== this.sender) { // checks if the signature matches the myPublicKey
      throw new Error('The signature of this transaction is not correct ==> transaction rejected')
    }
    const hashTx = this.createHash()
    const sig = signingKey.sign(hashTx, 'base64') // we sign the hash of our transaction, afterwards encoding the data to hex/base64 format
    this.signature = sig.toDER('hex') // defining blocks' signature and declaring hex-format via parameter
  }

  // transaction validity check
  isValid() {
    if (this.sender === null) { // check if the sender is null for mining reward
      return true // refers to the block reward which has no sender and do not need be signatured but is still valid
    }
    if (!this.signature || this.signature.length === 0) { // check if there is a signature or if it is empty
      throw new Error('No signature in this transaction!')
    } //  if there is a signature we verify if the transaction has been verified by the private key
    const publicKey = ec.keyFromPublic(this.sender, 'hex') // importing the public key in hex format
    return publicKey.verify(this.createHash(), this.signature) // we want to verify if the hash of the Transaction has been verified by that extracted public key
  }
}

// a Block is a group of transactions from the mempool beeing verified in the mining process and appended to the blockchain
class Block {
  constructor(timestamp, transactions, previousHash = '') { // previous set to empty as standard
    this.timestamp = timestamp // Date().toLocaleString()
    this.transactions = transactions
    this.previousHash = previousHash // hash value of the previous block
    this.nonce = 0 // nonce = "number used once" - starting by 0 and iterated  +1 per guess to find the X-Zero-Hash. The final number will be totally random and not be calculatable in advance since the SHA256 algorithm hasn't been reverse-engineered until now.
    this.hash = this.createHash() // create new block hash value
  }

  // combine all data of the Block and calculate a 256bit fingerprint-like hash on it to undoubtly identify the block's integrity
  createHash = () => {
    return SHA256(this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce).toString()
  }

  // Proof-of-work: to avoid tampering by cheaply recalculating the whole blockchain's hashes and therefore beeing valid again we add another security layer by extending the creation time a lot by this simple condition to match an X-amount of starting Zeros in the hash, until the desired time distances between block creation being matched. Resources in form of computing power and time have to be committed and spent
  searchXZeroHash = miningDifficulty => {
    while (this.hash.substring(0, miningDifficulty)/* <= checks the first+X hash characters */ !== Array(miningDifficulty + 1).join('0')) { // against a string of "0s" calculated by an empty array in the size of the diffculty+1 resulting in concatenating those empty values with "0" in zeros resulting in "0000" for diffuculty = 4 (join()method returns array as string). Iterating until the minimal amount of Zeros (mining Difficulty) beeing matched
      this.nonce++ // nonce getting increased by 1 in while loop until the previous condition of minimal amount of starting zeros is beeing met (Bitcoin using a 2nd nonce field already, since the scale is so big, that one nounce field is not sufficient because of overflow)
      this.hash = this.createHash() // using hashcalculation until finding the desired X-Zero-Hash according to the loop condition
    }
    console.log(`==>Blocked sucessfully mined with hash ${this.hash}`)
  }

  // Blockchain Security against tamper approaches
  isValid = () => {
    if (this.hash !== this.createHash()){ // hash comparison
      return false
    }
    return true
  }
}

// a Blockchain is an array of Blocks with each block pointing to the hash of the previous block
class Blockchain {
  constructor(name, miningDifficulty, blockreward, halvingEvent) {
    this.name = name // blockchain identifier to be chosen freely
    this.participants = [] // participants can be wallet owners or miners
    this.blockArray = [this.createFirstBlock()] // array of blocks starting with the Genesis Block to have a starting anchor (main difference it has no "previous block hash value")
    this.miningDifficulty = miningDifficulty // the artificial added difficulty level which is growing exponentially by each incremental increase due to the nature demanding more specific hash structures. Target extends or shortens the block creation time to control how fast blocks can be added to the blockchain - Unsufficient strong difficulty means that a spammer can create lots of fake blocks or even recreate the whole chain itself. Remember that this difficulty is fixed while in Bitcoin there is an adjustment every 2016 blocks to keep the 10 min block creation period in place
    this.memPool = [] // broadcastet transactions going here
    this.blockReward = blockreward // successfully appending a block to the blockchain rewards the miner with this amount. While Bitcoin started with "50" as initial reward, we take "6.25" as the recent value as start value
    this.halvingEvent = halvingEvent // every nth Block the mining reward getting halved. While Bitcoin adjusts the blockreward every 210000 blocks, we chose 2 to show the effect immidiately in our short deployment
  }

  // get participants, otherwise show error message if there are none
  get members() {
    return this.participants || 'No Participants'
  }
  // create new participants handed over by an array parameter
  set members(names) {
    this.participants.members = [...names]
    for (let i in this.participants) {
      this.participants[i] = new Participant(this.participants[i])
      console.log(` participant joined: ${this.participants[i].name}`)
    }
  }

  //  The first block of a blockchain is also called the "Genesis Block" and has to be created artifially (Not getting calculated by mining)
  createFirstBlock = () => {
    return new Block('Genesis Block', [], 'There is no previous Hash.') // getting filled with dummy data: there is no previous hash for the first block
  }

  // declaring all ledger participants and print the members
  addParticipants = (...names) => {
    console.log(`\n-=Starting the ${this.name} instance=-`)
    this.participants.push(...names)
    for (let i in this.participants) {
      this.participants[i] = new Participant(this.participants[i])
      console.log(` participant joined: ${this.participants[i].name}`)
    }
  }

  // declare a participant or multiple participants as miners which intends to add blocks the blockchain
  setMiner = name => {
    this.participants[this.participants.findIndex(x => x.name === name)].activeMiner = true
    console.log(`   Miner declared: ${this.participants[this.participants.findIndex(x => x.activeMiner === true)].name}`)
  }

  // function to reaveal the full ledger in JSON-format
  showFullLedger = () => {
    console.log(`\n${this.name} full ledger:`)
    console.log(JSON.stringify(this.blockArray, null, 4))
  }

  // user balance: you do not really have stored a concrete balance on your account or a single block but everytime you want to see your balance you have to scan the whole blockchain(=ledger)
  calculateBalance = (myPublicKey) => {
    let balance = config.startingBalance // for POC purposes we set a start balance - in real world scenarions BTC exculusively getting generated by mining - existing BTC can be purchased via cash afterwards
    for (const block of this.blockArray) {
      for (const tx of block.transactions) {
        if (tx.sender === myPublicKey) { // logic: if your wallet is identified as sender while checking all transactions and thus "giving away" balance, it will be reduced by this amount
          balance -= tx.amount // subtracting your sent assets from your balance
        }
        if (tx.sender === myPublicKey) { // logic: if your wallet is identified as recipient and thus "receiving" balance, it will be increased by this amount
          balance -= tx.transactionFee // adding your received funds to your balance
        }
        if (tx.recipient === myPublicKey) { // logic: if your wallet is identified as recipient and thus "receiving" balance, it will be increased by this amount
          balance += tx.amount // adding your received funds to your balance
        }
      }
    }

    // formatting function
    function roundXdec(number, decimals) {
      return +(Math.round(number + "e+" + decimals) + "e-" + decimals)
    }

    return roundXdec(balance, 8) // return actual cumulated balance after scanning all transactions of all blocks and subtracting/adding all relevant values
  }

  // checking the full ledger to get all participants most recent balance
  calculateBalanceAll = () => {
    console.log(`\nchecking the network participants' individual balance:`)
    for (let i in this.participants) {
      console.log(`   the Balance of ${this.participants[i].name} is: ${this.calculateBalance(this.participants[i].publicKey)}`)
    }
  }

  // creating a new Transaction with given input parameters and append it to the Blockchain mempool
  createTx = (signaturer, sender, recipient, amount, transactionFee, referenceNumber) => {
    const tx = new Transaction(this.participants[this.participants.findIndex(x => x.name === sender)].publicKey, this.participants[this.participants.findIndex(x => x.name === recipient)].publicKey, amount, transactionFee, referenceNumber)
    tx.sign(this.participants[this.participants.findIndex(x => x.name === signaturer)].keyPair)
    this.appendTx(tx)
    console.log(`--calling Transaction: ${sender} is sending ${amount} ${this.name} to ${recipient} (Reference: ${referenceNumber}, transaction fee: ${transactionFee.toFixed(8)}) ==>transaction signature verified`)
  }

  // receive the new transaction and add it to the memPool array
  appendTx = transaction => {
    if (!transaction.sender || !transaction.recipient) {  // check if sender or recipient are filled or missing and throws error otherwise to avoid transmissions to nowhere
      throw new Error('Transaction must include sender and recipient!')
    }
    if (!transaction.isValid()) { // gate for the additional security check, otherwise reject
      throw new Error('Transaction is not valid, check your signature.')
    }
    if (transaction.amount <= 0) { // handling negative values
      throw new Error('Transaction amount is not valid.')
    }
    if ( this.calculateBalance(transaction.sender) < transaction.amount) { // handling spending amounts you do not have
      throw new Error('Insufficient funds.')
    }
    this.memPool.push(transaction)
  }

  // mining function including status printing: creating a new candidate block including the validated transactions from the mempool and start the mining process for the X-Zero-Hash
  miningProcess = miningRewardAddress => {
    this.blockArray.length == 1 ? console.log(` Block N°1 as artificial Genesis Block - initializing the beginning of the blockchain with hash: ${this.blockArray[0].hash}`) : null
    const block = new Block(Date().toLocaleString(), this.memPool, this.blockArray[this.blockArray.length - 1].hash) // in real scenario there can be more transactions than a block can cover (arround 2.400 transactions) due to its limited size of 1 Megabyte (4Mb with Segwit) - therefore miners pick their transactions according to the transaction fees amount and prioritize them this way
    console.log(` initializing Block N°${this.blockArray.length + 1}:`)
    console.log(`   ...appending the hash of the previous block`)
    console.log(`   ...appending all pending transactions: ${this.memPool.map(x => x.referenceNumber)} `)
    const reducer = (x, y) => x + y
    let transactionFees = this.memPool.map(x => x.transactionFee).reduce(reducer)

    const totalMinerReward = () => { // in Bitcoin this is the "coinbase transaction"
      return this.blockArray.length % this.halvingEvent == 0 ? (this.blockReward /= 2) + transactionFees // including halving event every nth block via modulo
        :                                                       this.blockReward + transactionFees // adding the transaction fees
    }

    console.log(`   ...checking estimated block reward: ${this.blockReward}`)
    console.log(`   ...calculating estimated transaction fees: ${transactionFees.toFixed(8)}`)
    const rewardTx = new Transaction(null, miningRewardAddress, totalMinerReward(), 0, 'Mining Compensation') // adding mining award transactions (coinbase): they are not signed but still valid!
    this.memPool.push(rewardTx) // push the blockreward to the current block's transactions
    console.log(`   ...appending nonce: ${block.nonce}`)
    console.log(`   ...spamming growing nonces until a block hash matching the difficulty of min. ${this.miningDifficulty} leading zeros has been found`)
    block.searchXZeroHash(this.miningDifficulty) // finding the x-zero hash
    this.blockArray.push(block) // append the new block to the blockchain
    this.memPool = [] // clear the mempool
  }

  // function to trigger the mining process which grabs all transactions, finds the correct hash and appends it to the blockchain
  mineNextBlock = () => {
    console.log(`\nMiner-${this.participants[this.participants.findIndex(x => x.activeMiner === true)].name} is starting a mining process...`)
    this.miningProcess(this.participants[this.participants.findIndex(x => x.activeMiner === true)].publicKey) //  refers to the public key!
    console.log(`\n***...Broadcasting the new ${this.name} Version to the network***`)
    console.log(`***...network validation: Chain validity is ${!this.areBlocksValid() || !this.areTxValid()? 'broken' : 'given'}***`) // security checkup
  }

  // if we want to check one's transaction history
  showTxHistory = myPublicKey => {
    const txs = [];
    for (const block of this.blockArray) {
      for (const tx of block.transactions) {
        if (tx.sender === myPublicKey || tx.recipient === myPublicKey) {
          txs.push(tx);
        }
      }
    }
     // return txs
    return JSON.stringify(txs, null, 4)
     // console.log(`\n${name} transaction history: ${this.showTxHistory(this.articipants[this.participants.findIndex(x => x.name === name)].publicKey)}`) // print history
  }

  // reveal the full transaction history of a single participant
  checkWallet = name => {
    console.log(`\n${name} transaction history: ${this.showTxHistory(this.participants[this.participants.findIndex(x => x.name === 'Mirksen')].publicKey)}`)
  }

  // validity check for blocks
  areBlocksValid = () => {
    const genesis = JSON.stringify(this.createFirstBlock())
    if (genesis !== JSON.stringify(this.blockArray[0])) { // check if genesis has been tampered with
      return false
    }
    for (let block of this.blockArray) {
      if (!block.isValid()){
        console.log(`manipulated block in chain detected`)
        return false
      }
    }
    return true
  }

  // validity check for transaction objects
  areTxValid = () => {
    for (let block of this.blockArray) {
      for (let tx of block.transactions) {
        if (!tx.isValid()) {
          console.log('Transaction validation failed')
          return false
        }
      }
    }
    return true
  }
}
module.exports.Blockchain = Blockchain //export to be consumed in main