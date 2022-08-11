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
// *Valentic, Mirko  07.06.2021    first version
// *Valentic, Mirko  12.07.2021    seperated & outsourced hard coded parameters into new file "config.js"
// *Valentic, Mirko  24.07.2021    implemented audit functionality to be controlled by config.js parameter
*/

// declaring dependencie on own library
const { Blockchain } = require("./blockchain");
const config = require("./config");

// initialazing a new Blockchain instance
kryptoCurrency = new Blockchain(
  config.name,
  config.miningDifficulty,
  config.blockReward,
  config.halvingEvent
);

// adding particpants to the Blockchain network
kryptoCurrency.addParticipants(...config.participants);

// declaring which participants are mining
miners = config.miners;
kryptoCurrency.setMiner(...miners);

// iterate through the blockchain to get the balance for the participants
kryptoCurrency.calculateBalanceAll();

// iterate through all different phases of calculation enrichment of the blockchain: every defined array in config.js creates a new block which is a simple representation of aggregated transactions at a time
for (transactionArray of config.transactions) {
  // create Transactions with Signer, Sender, Recipient, Amount & Reference and add them to the mempool as first transactions
  for (transaction in transactionArray) {
    kryptoCurrency.createTx(...transactionArray[transaction]);
  }
  // trigger the mining process which grabs all  sent transactions from the mempool, finds the next valid block hash (aka mining) and appends it to the existing blockchain after the last valid block
  kryptoCurrency.mineNextBlock();
  // iterate through the blockchain again to get the new balance after the transactions went through
  kryptoCurrency.calculateBalanceAll();
}

// OPTIONAL FEATURE //
// SECURITY DEEP DIVE //

// TAMPER with the blockchain by increasing the transaction amount of a specific transaction in a specific block
if (config.tamperTry === true) {
  kryptoCurrency.blockArray[1].transactions[0].amount = 2;
}

if (config.audit === true) {
  for (block in kryptoCurrency.blockArray) {
    for (transaction in kryptoCurrency.blockArray[block].transactions) {
      console.log(
        JSON.stringify(
          kryptoCurrency.blockArray[block].transactions[transaction],
          null,
          4
        )
      );
      console.log(
        JSON.stringify(
          kryptoCurrency.blockArray[block].transactions[transaction].isValid(),
          null,
          4
        )
      );
    }
  }
  // single check all transactions
  for (block in kryptoCurrency.blockArray) {
    for (transactions in kryptoCurrency.blockArray[block].transactions) {
      console.log(
        `Block ${block}; Transaction; ${transactions}; ${JSON.stringify(
          kryptoCurrency.blockArray[block].transactions[transactions].isValid(),
          null,
          4
        )}`
      );
    }
  }
}

// aggregated security checks on transactions and blocks
console.log();
console.log(`Are all transactions valid?: ${kryptoCurrency.areTxValid()}`);
console.log(`Are all block valid?: ${kryptoCurrency.areBlocksValid()}`);

//
//
//
//
