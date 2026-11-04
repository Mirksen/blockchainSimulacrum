// Hints for the Leaderboard (PoolPanel, MinerProfile, LeaderboardTicker) and the details
// dialogs (BlockDetailsModal, ParticipantDetailsModal, TransactionDetailsModal).
// Format and tone: see ./index.js.

const OUTPUT_KIND_TEXT = {
  payment: { title: 'Payment', text: 'The coins the recipient gets. They stay locked to the recipient’s address until a later payment of theirs spends them.' },
  change: { title: 'Change', text: 'Inputs are always spent whole. What the payment does not use comes back to the sender as a new coin, like change for a banknote.' },
  memo: { title: 'Memo', text: 'The payment’s reference text, stored in an OP_RETURN output. It holds no coins, can never be spent, and anyone can read it.' },
  reward: { title: 'Reward', text: 'The miner’s pay for finding the block: the block reward (new coins) plus the fees of all payments in the block.' },
  commitment: { title: 'Leaderboard', text: 'A 0-coin output holding a fingerprint of the genesis, the round (a recent Bitcoin block) and the miner’s name. It ties this block’s work to that name on the leaderboard. It can never be spent.' }
};

const SCRIPT_TEXT = {
  coinbase: { title: 'Coinbase scriptSig', text: 'A coinbase spends no earlier coin, so this field holds free data instead: usually the block height, an extra nonce that gives the miner more headers to try, and a short tag. The genesis block’s holds a news headline.' },
  sig: { title: 'scriptSig', text: 'The unlocking script of this input: the owner’s signature and public key. Together with the locking script of the coin it spends, it must check out, or the input is invalid.' },
  lock: { title: 'Locked by', text: 'The locking script of the coin this input spends. It asks for a public key that hashes to the owner’s address and a valid signature made with that key.' },
  pubkey: { title: 'scriptPubKey', text: 'The locking script of this output: the condition a later payment must meet to spend it, usually a signature from the key behind one address. An OP_RETURN output can never be spent.' }
};

export const POOL_HINTS = {
  // ---------- leaderboard page ----------
  'pool.back': { title: 'Back to simulator', text: 'Return to the workbench. If your browser is mining here, it stops; blocks the leaderboard accepted stay on it.' },
  'pool.recent': { title: 'Last 144 blocks', text: 'The best hash of each name in the current window: rounds whose Bitcoin block is one of the last 144, about a day. Older work drops out of this list.' },
  'pool.all-time': { title: 'All time · top 20', text: 'The 20 names with the best single hash on this leaderboard, from any round.' },
  'pool.bitcoin-block': height => ({ title: `Bitcoin block #${height}`, text: `Opens block #${height} of the real Bitcoin chain on mempool.space, in a new tab. Leaderboard rounds are tied to recent Bitcoin blocks like this one, so the work cannot be done before they existed.` }),
  'pool.genesis': { title: 'Genesis', text: 'The first block of this site’s chain. Every leaderboard block stores its hash as the previous hash, so the work belongs to this chain. The genesis itself builds on the Bitcoin block named here.' },
  'pool.mine-title': { title: 'Keep mining', text: 'Let your browser mine on its own, outside the simulator, until you stop it. It sends a block each time it beats your best hash of this round by at least one leading zero, so each block it sends is harder to find than the one before.' },
  'pool.name': { title: 'Name on the leaderboard', text: 'The name your blocks count for. It is written into every block you mine and shown publicly. 3–20 letters, digits or hyphens. Names are not unique and there is no account. Locked while mining.' },
  'pool.join': { title: 'Join', text: 'Start mining under this name. Your browser asks the leaderboard for a round and searches until you press Stop. Every better hash it finds is sent and checked.' },
  'pool.stop': { title: 'Stop', text: 'Stop the search in your browser. Blocks already accepted stay on the leaderboard.' },
  'pool.round': { title: 'Round', text: 'The recent Bitcoin block your blocks are tied to. Its hash goes into each block, so the work cannot be done ahead of time. When it is no longer one of the last 144 Bitcoin blocks, a new round starts.' },
  'pool.attempts': { title: 'Attempts this round', text: 'How many hashes your browser has tried in the current round. Almost all of them miss: each extra leading zero takes about 16 times more tries.' },
  'pool.rate': { title: 'Hashes per second', text: 'How many hashes your browser tries each second. It depends on your device; a single Bitcoin mining machine does hundreds of trillions.' },
  'pool.accepted': { title: 'Accepted blocks', text: 'Blocks you sent from this page that the leaderboard checked and accepted. Within a round, each one has at least one more leading zero than the one before.' },
  'pool.best': { title: 'Your best this round', text: 'Leading zeros and difficulty of your best hash accepted from this page in this round. The next block you send needs at least one more zero.' },
  'pool.rank': { title: 'Rank', text: 'The place on this list. Most leading zeros wins; among equal zeros, the smaller hash (higher difficulty) is ahead.' },
  'pool.miner-name': { title: 'Name', text: 'The miner name written into the block. Names are not unique: everyone mining under the same name counts as one row.' },
  'pool.best-hash': { title: 'Best hash', text: 'The smallest block hash this name found. The highlighted leading zeros show how rare it is.' },
  'pool.zeros': { title: 'Zeros', text: 'How many zeros the hash starts with. Each extra zero is about 16 times rarer, so it takes about 16 times more tries on average.' },
  'pool.difficulty': { title: 'Difficulty', text: 'How hard the hash was to find, compared with a hash with one leading zero. It grows about 16 times per extra zero and also ranks hashes with the same number of zeros.' },
  'pool.blocks': { title: 'Blocks', text: 'How many accepted blocks this name sent in the span of this list, from this page or the simulator. Only the best one counts for the rank.' },
  'pool.profile-link': name => ({ title: name, text: `Open ${name}’s profile: its ranks and its best block per round, each one checkable.` }),
  'pool.verify': { title: 'Verify', text: 'Check this block yourself, in your browser: hash its 80-byte header and compare with the listed hash, and check that its coinbase names this miner and round. You do not have to trust the server.' },
  'pool.header-check': { title: '80-byte block header', text: 'The block’s header as stored: version, previous hash, Merkle root, time, bits (target) and nonce. Its double SHA-256, read back to front, is the block hash.' },
  'pool.commitment': { title: 'Commits to', text: 'The coinbase holds this fingerprint (SHA-256) of the site, the genesis hash, the round and the miner name. Through the Merkle root it is part of the header, so the work cannot be moved to another name.' },

  // ---------- miner profile ----------
  'pool.profile-back': { title: 'Leaderboard', text: 'Back to the two leaderboard lists.' },
  'pool.copy-link': { title: 'Copy link', text: 'Copy the address of this profile to the clipboard, to share it.' },
  'pool.you': { title: 'You', text: 'This is the name you mine under. Others can mine under the same name too.' },
  'pool.rank-recent': { title: 'Rank · last 144 blocks', text: 'This name’s place among rounds whose Bitcoin block is one of the last 144 (about a day). A dash means no block in that window.' },
  'pool.rank-all-time': { title: 'Rank · all time', text: 'This name’s place by its best hash from any round.' },
  'pool.rounds': { title: 'Rounds', text: 'The Bitcoin blocks this name mined for. For each round the leaderboard keeps the best block and counts the others.' },
  'pool.blocks-sent': { title: 'Blocks sent', text: 'All blocks of this name the leaderboard accepted, over the rounds listed below.' },
  'pool.profile-best': { title: 'Best hash', text: 'The smallest hash this name found in any listed round. The highlighted leading zeros show how rare it is.' },
  'pool.round-block': { title: 'Bitcoin block', text: 'The round: a real Bitcoin block whose hash went into this name’s blocks, so the work cannot have been done before it existed. Click the number to look it up.' },
  'pool.round-blocks': { title: 'Blocks', text: 'How many blocks this name sent in this round that the leaderboard accepted. Only the best one is kept.' },
  'pool.found': { title: 'Found', text: 'When the leaderboard received this round’s best block, in your local time.' },

  // ---------- ticker ----------
  'pool.ticker': { title: 'Leaderboard', text: 'The best miners on this site’s shared leaderboard, ranked by the most leading zeros in one hash. “Best today” covers the last 144 Bitcoin blocks, about a day. Click to open the leaderboard and mine for a better hash yourself.' },

  // ---------- details dialogs ----------
  'details.close': { title: 'Close', text: 'Close this window. Nothing changes.' },
  'details.validity': invalid => (invalid
    ? { title: 'Invalid block', text: 'Something changed after mining: its contents no longer produce its stored hash, or it no longer stores the current hash of the block before it. See the tamper analysis below.' }
    : { title: 'Valid block', text: 'Its contents still produce the hash it was mined with, and it stores the correct hash of the block before it.' }),
  'details.block-hash': { title: 'Block hash', text: 'The block’s fingerprint: the double SHA-256 of its 80-byte header below. Change anything in the block and it changes completely. The highlighted leading zeros are the proof of work.' },
  'details.previous-hash': isGenesis => (isGenesis
    ? { title: 'Previous hash', text: 'The genesis block has no block before it. It stores the hash of a real Bitcoin block instead, which proves this chain was started after that block existed.' }
    : { title: 'Previous hash', text: 'The hash of the block before this one. Storing it chains the blocks together: change an earlier block and this link no longer fits.' }),
  'details.merkle-root': { title: 'Merkle root', text: 'One hash that sums up all transactions in the block, built by hashing their IDs in pairs (a Merkle tree). It is part of the header, so changing any transaction changes the block’s hash.' },
  'details.nonce': { title: 'Nonce', text: '“Number used once”. The miner tried nonce after nonce until the block’s hash started with enough zeros. Finding it is the work; checking it takes one hash.' },
  'details.tx-count': { title: 'Transactions', text: 'How many transactions this block confirms. The first one is always the coinbase: the new coins for the miner.' },
  'details.volume': { title: 'Volume', text: 'The main amount of every transaction added up: each payment plus the miner’s reward, which includes the fees. Change going back to senders is not counted.' },
  'details.mined-at': { title: 'Mined at', text: 'The time the miner wrote into the block header, in your local time. It is part of the hashed header, so changing it would break the hash.' },
  'details.header': { title: '80-byte header', text: 'The block’s summary as raw bytes: version, previous hash, Merkle root, time, bits (the target the hash must stay below) and nonce. Its double SHA-256 is the block hash. Numbers are stored back to front (little-endian), as in Bitcoin.' },
  'details.tamper': { title: 'Tamper analysis', text: 'What broke and where: a hash mismatch means the block’s contents changed after mining; a broken link means the block before it changed and got a new hash.' },
  'details.transactions': { title: 'Transactions', text: 'The transactions this block confirms, the coinbase first. Select one to see the coins it spends, what it pays, the change and the fee.' },
  'details.tx-row': coinbase => (coinbase
    ? { title: 'Mining reward', text: 'The coinbase: it spends no earlier coins but creates new ones, the block reward plus all fees, for the miner. Click for its details.' }
    : { title: 'Payment', text: 'Click to see which coins it spends, who receives what, the change back to the sender and the fee.' }),

  'details.balance': { title: 'Balance', text: 'The sum of this wallet’s unspent coins listed below, from confirmed blocks only. Payments still waiting in the mempool do not count yet.' },
  'details.received': { title: 'Total received', text: 'Everything paid to this wallet in confirmed blocks, mining rewards included. Change coming back from its own payments is not counted.' },
  'details.sent': { title: 'Total sent', text: 'What this wallet paid to others in confirmed blocks. Fees and change are not included.' },
  'details.rewards': { title: 'Mining rewards', text: 'What this miner earned for the blocks it found: each time the block reward (new coins) plus the fees of the payments in that block.' },
  'details.tx-total': { title: 'Total TXs', text: 'How many confirmed transactions this wallet paid or received in, mining rewards included.' },
  'details.miner-enabled': enabled => (enabled
    ? { title: 'Miner enabled', text: 'This miner takes part in the race for the next block. Click to switch it off; it keeps its coins. Locked while a block is being mined.' }
    : { title: 'Miner disabled', text: 'This miner sits out the race for the next block. Click to let it mine again. Locked while a block is being mined.' }),
  'details.hashpower': { title: 'Hashpower', text: 'This miner’s share of the racing miners’ hashpower: its chance to find the next block. Change it, also during a race, in the miner details.' },
  'details.coins': { title: 'Coins (unspent outputs)', text: 'A wallet stores no balance. It owns separate coins: outputs of earlier transactions that nobody has spent yet (UTXOs). Each is named by the transaction that created it and its position, txid:number.' },
  'details.address': { title: 'Address', text: 'Where others send coins to this wallet: a hash of its public key in Bitcoin’s Base58 format. It is safe to share; nobody can spend with it.' },
  'details.public-key': { title: 'Demo public key', text: 'Made from the wallet’s private key. With it anyone can check the wallet’s signatures, but nobody can make one. A demo key: created in this simulation, never for real money.' },
  'details.recovery-phrase': { title: 'Recovery phrase (BIP39)', text: 'Words that encode the wallet’s secret. The private key is derived from them again, so the words alone restore the wallet. In real life whoever knows them owns the coins: never show them to anyone.' },
  'details.verify-recovery': { title: 'Verify recovery', text: 'Rebuild the key from these words in your browser and check that it gives the same public key. Nothing is sent anywhere. Locked while a block is being mined.' },
  'details.history': { title: 'Transaction history', text: 'Every confirmed transaction in which this wallet paid or received coins, newest first.' },
  'details.history-row': kind => ({
    reward: { title: 'Mining reward', text: 'New coins this miner created for finding a block, plus the fees in it. Click for its details.' },
    incoming: { title: 'Received', text: 'A payment to this wallet. Click to see which coins paid for it.' },
    outgoing: { title: 'Sent', text: 'A payment from this wallet. Click to see the coins it spent, the change back and the fee.' }
  }[kind]),

  'details.inputs': { title: 'Inputs', text: 'The coins this transaction spends. Each input points at an output of an earlier transaction (its txid and position) and spends it whole. A coinbase has none: it creates new coins.' },
  'details.outputs': { title: 'Outputs', text: 'The new coins this transaction creates, each locked to a recipient. Unspent outputs are what wallets own; a later payment spends them as its inputs.' },
  'details.output-kind': kind => OUTPUT_KIND_TEXT[kind] ?? OUTPUT_KIND_TEXT.payment,
  'details.fee': { title: 'Fee', text: 'The fee is written nowhere: it is what the inputs leave over after the outputs. The miner of the block collects it. When blocks are full, the highest fee per byte goes first.' },
  'details.txid': { title: 'Transaction ID (TXID)', text: 'The transaction’s name: a double SHA-256 hash of its raw bytes. Later inputs refer to its coins by this ID. Change one byte and the ID changes, so those references point at nothing.' },
  'details.signature': { title: 'Signature', text: 'Proof that the owners of the coins agreed. Each input carries one, made with its owner’s private key over this transaction, outputs included, so changing an amount breaks it. Anyone can check it with the public key.' },
  'details.scripts': { title: 'Scripts', text: 'Show the small programs that lock and unlock coins: each output’s script says who may spend it, each input’s script provides the signature and public key that unlock the coin it spends.' },
  'details.script': kind => SCRIPT_TEXT[kind],
  'details.raw': { title: 'Raw bytes', text: 'Show the transaction exactly as it is stored and hashed: version, inputs, outputs and lock time as hexadecimal bytes. Its double SHA-256 is the TXID.' },
  'details.tx-block': { title: 'Block', text: 'The block that confirmed this transaction. Mempool means it is still waiting for a block.' },
  'details.size': { title: 'Bytes', text: 'The transaction’s size. Block space is limited, so miners compare fees per byte.' },

  // ---------- usage sharing ----------
  'usage.toggle': { title: 'Usage sharing', text: 'Whether this site may send usage counts and error reports. It is on unless you opt out. Open to read what is shared and to change it.' },
  'usage.share': { title: 'Share usage and technical errors', text: 'When checked, counts such as “block mined”, mining timings and cleaned-up error reports go to PostHog in the EU. Keys, seed words, payment text and names are not sent. Uncheck to stop at once.' }
};
