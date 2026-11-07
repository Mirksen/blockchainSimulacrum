// Hints for the top bar, the missions and the workbench cards. Format and tone: see ./index.js.

const STATUS_TEXT = {
  valid: { title: 'Valid', text: 'This block passes every check: its contents still produce its hash, the hash starts with enough zeros, and it correctly stores the hash of the block before it.' },
  'hash-mismatch': { title: 'Hash mismatch', text: 'Something in this block changed after it was mined. Its contents now produce a different hash, and that hash no longer starts with the required zeros. Re-mining finds a new nonce that fixes it.' },
  'link-broken': { title: 'Link broken', text: 'This block still stores the old hash of the block before it. That block was changed and got a new hash, so the link points to something that no longer exists. Re-mining this block fixes the link.' },
  'built-on-broken': { title: 'Built on a broken block', text: 'This block itself checks out, but it sits on top of a broken block. A chain is only valid if every earlier block is valid too.' },
  'signature-invalid': { title: 'Signature invalid', text: 'A payment in this block was changed, so its digital signature no longer fits. Re-mining cannot fix that: only the sender’s private key could sign the new version. Undo the edit instead.' },
  'transaction-invalid': { title: 'Transaction invalid', text: 'A payment in this block breaks a rule, for example it spends coins that do not exist. Re-mining cannot fix that. Undo the edit instead.' }
};

export const WORKBENCH_HINTS = {
  // ---------- top bar ----------
  'nav.workbench': { title: 'Workbench', text: 'The main simulator: a small blockchain that runs entirely in your browser. Mine blocks, send coins and try to cheat, and watch the chain catch it.' },
  'nav.hash-lab': { title: 'Hash lab', text: 'The hash function on its own. Type any text and see its fingerprint change completely, then search for a number (nonce) that makes the fingerprint start with zeros.' },
  'nav.chain-lab': { title: 'Chain lab', text: 'Three toy blocks you edit by hand. Change old data, watch the links break and repair them by re-mining. Also: competing branches and payment proofs.' },
  'nav.pool': { title: 'Leaderboard', text: 'A shared scoreboard for everyone on this site. Blocks you mine under your name are sent there; the hash with the most leading zeros ranks highest.' },
  'menu.explain': on => ({ title: 'Explain mode', text: on
    ? 'Explain mode is on: tap any button, number or word to see what it means. Tap here or Done to use the simulator again.'
    : 'For touch screens. Turn it on, then tap any button, number or word to see what it means. Nothing you tap acts until you tap Done.' }),
  'menu.more': { title: 'More', text: 'Reset the simulation, open the settings, switch the sound and the light or dark theme.' },
  'menu.reset': { title: 'Reset', text: 'Start over: a new chain with only the genesis block and an empty mempool; added wallets and miners go. Difficulty, coin name, halving interval and block time stay as set; a workbench mission in progress starts its steps again.' },
  'menu.settings': { title: 'Settings', text: 'Coin name, mining difficulty, halving interval and target block time.' },
  'menu.sound': muted => ({ title: 'Sound', text: muted ? 'Sound is off. Turn it on to hear a short chime whenever a block is found.' : 'Plays a short chime whenever a block is found. Click to mute it.' }),
  'menu.theme': next => ({ title: next === 'light' ? 'Light theme' : 'Dark theme', text: `Switch to ${next === 'light' ? 'light' : 'dark'} colors. Nothing else changes.` }),

  // ---------- missions ----------
  'mission.start': { title: 'Start missions', text: 'A guided path of short experiments. Each mission tells you the next step and points at the button you need. You can leave it any time.' },
  'mission.dismiss': { title: 'Don’t show again', text: 'Hides this invitation in this browser. The Missions button on the left stays, so you can start later.' },
  'mission.open': { title: 'Missions', text: 'Short guided experiments, one step at a time: mine a block, send coins, cheat and get caught.' },
  'mission.collapse': { title: 'Hide missions', text: 'Fold the missions away and play freely. Your progress is kept.' },
  'mission.show-me': { title: 'Show me', text: 'Jumps to the place where this step happens and marks the button you need.' },

  // ---------- chain band ----------
  'chain.title': { title: 'Chain', text: 'The blockchain: a row of blocks, oldest on the left. Each block stores the hash of the block before it, so changing any old block breaks every link after it. Click a block to see its details below.' },
  'chain.health': (valid, open) => (valid
    ? { title: 'Chain valid', text: `Every block’s hash starts with enough zeros and every block stores the correct hash of the one before. ${open ? 'Click to hide the checks.' : 'Click to see the checks per block.'}` }
    : { title: 'Chain invalid', text: `At least one block fails a check, usually because its data was changed after mining. ${open ? 'Click to hide the checks.' : 'Click to see which block fails and why.'}` }),
  'chain.view': list => (list
    ? { title: 'Row', text: 'Show the blocks again as one row that swipes sideways.' }
    : { title: 'List', text: 'Show the blocks as a list, newest on top. Tap a block for its full hash, Copy and “Open in Chain lab”.' }),
  // The key figures carry their rule and its forecast (web/DESIGN.md, "Key figures").
  'chain.block-time': pace => ({ title: 'Block time', text: pace
    ? `The average the next difficulty check measures: ${pace.blocks ? `the last ${pace.blocks} blocks took ${pace.seconds} each` : 'no block timed since the last check'}, against the ${pace.target} target. `
      + `The marker shows where it sits; the shaded band (${pace.low}–${pace.high}) keeps the difficulty as it is. Bitcoin aims at 10 minutes.`
    : 'How long blocks take to be found: the recent average against the target. Every 10 blocks the difficulty adjusts so the average moves toward the target, as in Bitcoin (every 2,016 blocks, aiming at 10 minutes).' }),
  'chain.difficulty': { title: 'Difficulty', text: 'How many zeros a block hash must start with. Each extra zero makes a valid hash about 16 times rarer, so finding one takes about 16 times longer.' },
  'chain.check': check => ({ title: 'Difficulty check', text: `After every 10th block the last ten are averaged: faster than ${check.low} adds a leading zero (about 16 times the work), `
    + `slower than ${check.high} removes one, in between the difficulty stays. ${check.forecast} Bitcoin checks every 2,016 blocks.` }),
  'chain.reward': halving => ({ title: 'Block reward', text: 'New coins the winner of the next block creates for itself, on top of the fees of the payments it includes. This is how new coins come into existence.'
    + (halving ? ` It halves every ${halving.every} blocks: #${halving.at} pays ${halving.reward}, like Bitcoin’s halving every 210,000 blocks.` : '') }),
  'chain.halving': { title: 'Next halving', text: 'From this block on, the block reward is cut in half. Halvings make the coin supply grow ever slower, like Bitcoin’s every 210,000 blocks (about four years).' },
  'chain.change': mark => ({ title: { halving: 'Halving', check: 'Difficulty check' }[mark.kind] ?? 'Difficulty change', text: mark.title }),
  'chain.candidate': { title: 'Next block', text: 'The block being built now. It does not belong to the chain until a miner finds a valid hash for it. Its controls are in the Next block card below.' },

  // ---------- block card ----------
  'block.status': kind => STATUS_TEXT[kind] ?? STATUS_TEXT.valid,
  'block.hash': { title: 'Hash', text: 'The block’s fingerprint: a double SHA-256 of its 80-byte header. Change anything in the block and the hash changes completely. The highlighted leading zeros are the proof of work.' },
  'block.hash-now': { title: 'Hash now', text: 'The hash the block’s contents produce today, after the change. It no longer starts with enough zeros, so the block fails.' },
  'block.as-mined': { title: 'As mined', text: 'The hash the block had when it was mined. The next block still stores this one as its link.' },
  'block.previous': isGenesis => (isGenesis
    ? { title: 'Previous', text: 'The genesis block has no block before it. Here it stores the hash of a real Bitcoin block instead, which proves this chain was started after that block existed.' }
    : { title: 'Previous', text: 'The hash of the block before this one. Storing it chains the blocks together: change an earlier block and this link no longer fits.' }),
  'block.link-intact': index => ({ title: 'Link intact', text: `This is exactly the hash of block #${index}, so the two blocks are correctly chained.` }),
  'block.tx-count': { title: 'Committed', text: 'The Merkle root covers every transaction of this block. Change one and the root, and with it the block hash, changes.' },
  'block.nonce': { title: 'Nonce', text: '“Number used once”. Miners try nonce after nonce until the block’s hash starts with enough zeros. Finding it is the work in proof of work; checking it takes one hash.' },
  'block.miner': { title: 'Miner', text: 'Who found this block. The miner is paid through the block’s first transaction, the coinbase: the block reward plus all fees.' },
  'block.merkle-root': { title: 'Merkle root', text: 'One hash that sums up all payments in the block, built by hashing them in pairs (a Merkle tree). It is part of the header, so changing any payment changes the block’s hash.' },
  'block.your-edit': { title: 'Your edit', text: 'The amount you changed after the block was mined. Undo edit puts the original back.' },
  'block.copy': { title: 'Copy', text: 'Copy the full 64-character hash to the clipboard.' },
  'block.chain-lab': { title: 'Open in Chain lab', text: 'Opens the Chain lab: a separate toy chain of three blocks where you change data and re-mine by hand, step by step. This chain stays as it is.' },
  'block.tamper': canTamper => (canTamper
    ? { title: 'Tamper with this block', text: 'Play the attacker: change the amount of one payment in this block after it was mined, then watch the chain catch the change.' }
    : { title: 'Tamper with this block', text: 'This block has no payment to change.' }),
  'block.undo': { title: 'Undo edit', text: 'Puts the original amount back, as if nothing happened.' },
  'block.details': { title: 'Details', text: 'Everything about this block in one view: hashes, nonce, the raw 80-byte header and all its transactions.' },
  'block.change-amount': { title: 'Change amount', text: 'Saves your new amount into the already mined block. Its hash will no longer fit.' },
  'block.transactions': { title: 'Transactions', text: 'The payments this block confirms. The first one is always the coinbase: the new coins for the miner.' },
  'block.tx-row': coinbase => (coinbase
    ? { title: 'Coinbase', text: 'The first transaction of every block. It spends no earlier coins: it creates new ones, the block reward plus all fees, and pays them to the miner. Click for its inputs and outputs.' }
    : { title: 'Payment', text: 'Click to see which coins it spends, who receives what, the change back to the sender and the fee.' }),
  'block.tx-in': { title: 'In (inputs)', text: 'The earlier coins this payment spends, each used up completely, with their owner and the block they came from.' },
  'block.tx-out': { title: 'Out (outputs)', text: 'The new coins this payment creates: one for the recipient, usually one “change” back to the sender. Whatever inputs and outputs differ by is the fee for the miner.' },
  'block.txid': { title: 'TXID', text: 'Transaction ID: the double SHA-256 hash of the transaction’s bytes. Later payments refer to a coin by this ID plus its output number.' },
  'block.tx-raw': { title: 'Scripts, signature and raw bytes', text: 'The technical view: the scripts that lock and unlock the coins, the digital signature that proves the owner agreed, and the transaction as raw bytes.' },

  // ---------- next block card ----------
  'next.title': { title: 'Next block', text: 'The block being built right now from the waiting payments. It joins the chain as soon as one miner finds a hash with enough leading zeros.' },
  'next.difficulty': lock => ({ title: 'Difficulty', text: `How many zeros the block hash must start with. Each extra zero makes mining about 16 times slower.${lock === 'mining' ? ' Locked while a block is being mined.' : lock === 'repair' ? ' Locked until the chain is repaired.' : ''}` }),
  'next.mine-locked': { title: 'Repair first', text: 'New blocks wait while the chain is invalid: a block on a broken chain would be worthless. Re-mine or undo below first.' },
  'next.lower': startsNewChain => ({ title: 'Lower difficulty', text: startsNewChain
    ? 'One zero fewer starts a new chain (you are asked first). Otherwise easy blocks could make a chain longer without more work, and in Bitcoin the chain with the most work counts.'
    : 'One zero fewer: blocks are found about 16 times faster.' }),
  'next.raise': { title: 'Raise difficulty', text: 'One zero more: blocks take about 16 times longer. High settings can take longer than you want to wait; Pause stops the search.' },
  'next.start-demo': { title: 'Start demo', text: 'Mines the first block and shares its reward with the other wallets, so everyone has coins to send. A good first click.' },
  'next.mine': (shortcut = true) => ({ title: 'Mining', text: `Start the race: every miner tries nonce after nonce until one finds a hash with enough leading zeros. The winner adds the block and earns the reward.${shortcut ? ' Shortcut: M.' : ''}` }),
  'next.pause': { title: 'Pause', text: 'Stop the search. The unfinished block is dropped; nothing is added to the chain. You can change the difficulty and start again.' },
  'next.auto-mine': on => (on
    ? { title: 'Auto-mine is on', text: 'After each found block the next race starts by itself. Click to stop after the current block.' }
    : { title: 'Auto-mine', text: 'Keep mining block after block once you press Mining, instead of stopping after one. Pairs well with Auto on the Mempool for a running economy.' }),
  'next.your-name': locked => ({ title: 'Your name', text: `Your miner name on the shared leaderboard. It is written into every block you mine here, and each block is sent to the leaderboard under it. 3–20 letters, digits or hyphens.${locked ? ' Locked while a block is being mined.' : ''}` }),
  'next.miner': name => ({ title: name, text: `Click for ${name}’s share of the hashpower, which is its chance to win the next block, and its newest guesses. Between races you can also rename it.` }),
  'next.progress': { title: 'Leading zeros', text: 'How many of the required leading zeros this miner’s best hash reached. Full means it found a valid block.' },
  'next.live-progress': { title: 'Live search', text: 'The hash this miner is trying right now; zeros that already fit are highlighted. The bar holds the best number of leading zeros for a second, then settles.' },
  'next.back': (name, backed) => (backed
    ? { title: `You back ${name}`, text: 'Your pick for the race. Click again to withdraw.' }
    : { title: `Back ${name}`, text: `Bet on ${name} to win the next race, just for fun: nothing is at stake. More hashpower means better odds, never a sure win.` }),
  'next.create-miner': full => (full
    ? { title: 'Create miner', text: 'At most 4 miners race in this simulation.' }
    : { title: 'Create miner', text: 'Add another simulated miner to the race, up to 4. It joins with the next block, with an equal share of the hashpower and with no coins.' }),
  'next.hashpower': { title: 'Hashpower', text: 'This miner’s share of all hashpower: how many hashes it tries compared with the others, and so its chance to find the next block. The other miners give way in proportion. Works during a race too. In the real world that is the share of all mining hardware.' },
  'next.normal-speed': { title: 'Normal speed', text: 'End slow motion: the race runs at full speed again. Slow motion also ends when you close the miner details or the block is found.' },
  'next.all-streams': on => (on
    ? { title: 'Hide streams', text: 'Fold the miners’ attempt lists away again.' }
    : { title: 'All streams', text: 'Every miner’s newest guesses side by side. More hashpower makes a list run faster.' }),
  'next.remine': (index, target, shortcut = true) => ({ title: `Re-mine block #${index}`, text: `Search a new nonce so the edited block’s hash starts with ${target} again. That gives it a new hash, so the block after it must be re-mined too. This is why rewriting history costs so much work.${shortcut ? ' Shortcut: M.' : ''}` }),
  'next.undo-edit': { title: 'Undo edit', text: 'Put the original payment back. A broken signature or rule cannot be repaired by re-mining, only by undoing the change.' },
  'next.repair-order': { title: 'Re-mine order', text: 'The blocks that need a new nonce, in order. Each re-mine changes a hash that the next block stores, so the repair walks forward one block at a time.' },

  // ---------- mempool ----------
  'mempool.title': { title: 'Mempool', text: 'The waiting room (memory pool) for payments that are signed but not yet in a block. The next block’s miner picks from here.' },
  'mempool.new': { title: 'New transaction', text: 'Send coins from one wallet to another. The payment waits here until a mined block includes it.' },
  'mempool.auto': on => (on
    ? { title: 'Auto-transact is on', text: 'Sample payments between wallets with coins keep the mempool filled. Click to stop; payments already waiting stay.' }
    : { title: 'Auto-transact', text: 'Fill an empty mempool with random sample payments between wallets that have coins. It waits while a block is mined.' }),
  'mempool.space': { title: 'Block space', text: 'A block has limited room. Miners fill it with the highest fee per byte first; the rest waits for a later block.' },
  'mempool.from': { title: 'From', text: 'The wallet that pays. It signs the payment with its private key and needs enough coins.' },
  'mempool.to': { title: 'To', text: 'The wallet that receives the coins.' },
  'mempool.amount': { title: 'Amount', text: 'How much to send. The coin is virtual: no real money moves.' },
  'mempool.reference': { title: 'Reference', text: 'An optional note, like a payment reference. It is stored in the transaction and can be read by anyone.' },
  'mempool.fee-rate': { title: 'Fee rate', text: 'The fee per byte of the payment’s size, in satoshis (the smallest unit). When blocks are full, miners take the highest fee rate first. The fee goes to the miner.' },
  'mempool.add': { title: 'Add to mempool', text: 'Sign the payment and put it in the mempool. It is confirmed once a mined block includes it.' },
  'mempool.wait': reason => ({ title: { full: 'Block full', parent: 'Waits for its parent', invalid: 'Orphaned by an edit' }[reason], text: {
    full: 'No room left in the next block: payments with a higher fee per byte go first.',
    parent: 'It spends a coin from a payment that is still waiting; it can follow that one at the earliest.',
    invalid: 'An edit of history removed a coin it spends. Undo the edit, or it never fits into a block.'
  }[reason] }),
  'mempool.tx': { title: 'Pending payment', text: 'Click for its details: which coins it spends, the change back to the sender and the fee.' },
  'mempool.coinbase': { title: 'Coinbase → winner', text: 'Not a payment yet: when the next block is found, its winner pays itself the block reward plus all fees of the included payments.' },

  // ---------- wallets ----------
  'wallets.title': { title: 'Wallets', text: 'Everyone in the simulation. A wallet holds a private key that signs payments; its balance is the sum of the unspent coins it owns. Miners are wallets too.' },
  'wallets.create': { title: 'Create wallet', text: 'Add a new person with an empty wallet. Send it coins from another wallet.' },
  'wallets.row': (name, isMiner) => ({ title: name, text: `Open ${name}’s wallet: its balance, the coins it owns, its address and keys, and every payment it made or received.${isMiner ? ' In the row: the blocks it has won and its H/s, the hashes it tries per second.' : ''}` }),

  // ---------- activity ----------
  'activity.title': { title: 'Activity', text: 'Payments that are confirmed: they are in a mined block. Newest first.' },
  'activity.times': { title: 'Block times', text: 'How long each block took to find, with the average and the target. The difficulty adjusts every 10 blocks to keep the average near the target.' },

  // ---------- settings ----------
  'settings.coin': { title: 'Coin name', text: 'Just a label for the virtual coin. It changes nothing in the rules.' },
  'settings.difficulty': { title: 'Mining difficulty', text: 'How many zeros a block hash must start with. Each step makes mining about 16 times slower on average. Raising keeps the chain; lowering by hand starts a new one.' },
  'settings.halving': { title: 'Halving interval', text: 'After this many blocks the block reward is cut in half. Bitcoin halves every 210,000 blocks.' },
  'settings.block-time': { title: 'Target block time', text: 'How long a block should take on average. Every 10 blocks the difficulty adjusts toward it. Bitcoin aims at 10 minutes.' },
  'settings.shortcut': { title: 'Mining shortcut', text: 'M starts mining or re-mining between races. Turn this off if single-letter shortcuts interfere with speech input or assistive technology. The mining button always works.' }
};
