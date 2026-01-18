var config = {};

// name your new blockchain currency
config.name = "Lukacoin";
// set the mining difficulty by the necessary number of leading Zeros of the block Hash CAUTION difficulty increases exponentially!
if (process.argv[2] == null) {
  config.miningDifficulty = 3;
} else {
  config.miningDifficulty = Number(process.argv[2]);
}
// set the mining reward per block
config.blockReward = 3.125;
// set the amount of blocks after which the mining reward will be halvedo
config.halvingEvent = 2;
// Mining log to see hashing details
config.miningLog = false;
if (process.argv[3] == null) {
  config.miningLog = false;
} else {
  config.miningLog = Boolean(process.argv[3]);
}
// for demonstration purposes we can airdrop "starting money" to all participants instead of naturally let it flow from the miners to the users like it would be economically correct for the beginning of a blockchain
config.startingBalance = 10;

//add the blockchain participants including miners (since the will have wallets, too)
config.participants = ["Mirksen", "Kate", "Bill", "Chris", "Minas"];
//declare the amount of miners. Coinbase transaction will be exclusively awarded to the first miner right now.
config.miners = ["Minas"];

//place to add an amount of transactions to the corresponding upcoming block to simulate a time line
config.transactions = [
  //FIRST BLOCK you can put n transactions here formated as an array to be included in the first block
  // create Transactions with Signer, Sender, Recipient, Amount & Reference and add them to the mempool as first transactions
  [
    ["Mirksen", "Mirksen", "Kate", 1, 0.00000001, "Bill N°230411"],
    ["Bill", "Bill", "Chris", 5, 0.00000001, "BWM Cabrio 4 Series (2021)"],
  ],
  //SECOND BLOCK you can put n transactions here formated as an array to be included in the second block
  // create Transactions with Signer, Sender, Recipient, Amount & Reference and add them to the mempool as further transactions for the second block
  [
    ["Mirksen", "Mirksen", "Kate", 8, 0.00000001, "N°281119"],
    ["Chris", "Chris", "Bill", 1.25, 0.00000001, "Refund: Broken Engine"],
  ],
  //THIRD BLOCK you can put n transactions here formated as an array to be included in the third block
  // create Transactions with Signer, Sender, Recipient, Amount & Reference and add them to the mempool as further transactions for the third block
  [
    ["Kate", "Kate", "Minas", 0.2, 0.00000001, "Antminer S14"],
    ["Kate", "Kate", "Minas", 0.00498, 0.00000001, "Antminer S14 accessories"],
    ["Chris", "Chris", "Kate", 0.0000018, 0.00000001, "meal thursday"],
  ],
];
// list of blockhashes
config.blockHashes = [];

// list of stringified block times for log purposes
config.miningTimes = [];

// Counting blocks
config.blockCounter = 0;

// adds a detailed breakdown for every transaction and checks if the transaction is valid for every block. Additionally there is condensed result list at the end of the program
config.audit = false;
// changes the transacted amount of the first transaction in the first block to be "2" instead
config.tamperTry = false;

module.exports = config;
