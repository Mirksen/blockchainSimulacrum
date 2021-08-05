# blockchain simulacrum
#### Video Demo:  https://youtu.be/sYBxClODaJw
#### Description:
The software is imitating specific aspects of the Bitcoin blockchain, therefore making specific concepts more transparent:
- creating a cryptographic keypair for each participant, usable as wallet (asymmetric encryption)
- hashing the transactions to gain a unique "fingerprint" (hash)
- grouping the transactions into "blocks" with its own untamperable unique "fingerprint" (hash) including the hash of the previous block
- appending the blocks to a chain of blocks (blockchain) which are connected through their own hash including the hash of the predecessor block
- the blockhash is demanding "Proof of Work", consisting of the amount of leading Zeros in the block hash (X-Zero-Hash)
- audit functionality is checking if the integrity of transactions, blocks and blockchain is given and it have not been tampered with
- participant balance can be checked, for ease of demonstration purposes we work with a starting balance


we have 3 files:
- main.js which has the actual function calls in order to mine 3 (or more) blocks in a row
- blockchain.js which has the classes and methods definitions, used in main.js
- config.js where you can alter and edit all the parameters (blockchain name, mining difficulty, mining reward, halving event definition, participants, miner declaration, starting balance, transaction content, audit functionality trigger)

to start the program, type in the terminal while beeing in the "project" folder:
"node main.js"

to alter the settings and blockchain behaviour:
edit config.js file

to mine additional blocks:
add additional array in the transaction section in config.js

to increase the mining difficulty:
adjust the the parameter in config.js

Design decisions:
terminal style program has been sufficient and been more fitable to check the code vs the outcome in the terminal,
since this program is for educational pruposes to understand blockchain concepts better.
node.js has been chosen for its non-compiling nature to iterate faster been code editing and outcome cross checks

Roadmap:
What is actually not implemented is an automatical mining difficulty adjustment by mining time to get a consistent block mining average time , like Bitcoin does.
Competetion is also not included between several miners to compete for the next block hash, right now, the first miner declared will always mine the blocks

detailed description of concepts and code can be found as comments in the code itself.