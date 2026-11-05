import { BLOCK_WORK, ROUND_LIMIT } from '../forkLab';
import { SEARCH_LIMIT } from '../hashLab';

// Hints for the Hash lab and the Chain lab (HashLab, ChainLab, ForkExperiment, MerkleProof).
// Format and tone: see ./index.js.

const LIMIT = SEARCH_LIMIT.toLocaleString('en-US');
const zerosText = n => (n === 1 ? 'one zero' : `${['', 'one', 'two', 'three'][n] ?? n} zeros`);

export const LAB_HINTS = {
  'lab.text.input': { title: 'Your text', text: 'Exactly this text goes into SHA-256. Letters, spaces and numbers all count. Try adding or changing a number until the hash begins with 0.' },
  'lab.text.hash': { title: 'SHA-256 hash', text: 'A 64-character fingerprint of the text, using 0–9 and a–f. The same text always gives the same hash. Changing the text scrambles the fingerprint. It is not encrypted text that you can decrypt.' },
  'lab.text.nonce': { title: 'Nonce', text: 'A number miners change to get another hash. In this text experiment you append it to your name. In a Bitcoin block it has its own field in the header.' },
  'lab.text.difficulty': { title: 'Difficulty', text: 'How hard a matching hash is to find. Here one leading zero is enough. Each extra zero makes a match about 16 times rarer per attempt, on average.' },
  'lab.text.proof': { title: 'Your first proof', text: 'The exact text and hash of your first match found by hand. You can check them with any SHA-256 text tool. Reset clears this proof.' },
  'lab.text.automate': { title: 'Try automatically', text: 'Keep the text, replace a final space and number if present, and try a space followed by 1, 2, 3… The full input stays visible. Stops at a match or 50,000 tries.' },
  'lab.text.stop': { title: 'Stop trying', text: 'Stop the automated search. The last text tried stays visible, so you can check or edit it by hand.' },
  'lab.text.harder': { title: 'Try two zeros', text: 'Ask for 00 instead of 0. This changes only the rule: the text and hash stay the same. A match is about 16 times rarer per attempt.' },
  'lab.text.headers': { title: 'Continue to block mining', text: 'Explore the same search idea with a Bitcoin block header: fixed fields plus a changing nonce, hashed twice with SHA-256. This isolated experiment does not mine real coins.' },
  'lab.text.reset': { title: 'Reset text experiment', text: 'Clear your text and first proof, stop the search and return to a one-zero target. Nothing changes in the simulator.' },
  'lab.text.back': { title: 'Back to text hashing', text: 'Return to the simple text experiment. A running block-header search stops. The simulator stays unchanged.' },
  // ---------- shared ----------
  'lab.back': { title: 'Back to simulator', text: 'Leave the lab and return to the simulator. A running search stops. Nothing you did in the lab changed the simulator’s chain or wallets.' },

  // ---------- hash lab ----------
  'lab.hash.reset': { title: 'Reset lab', text: 'Start over with the original message “Hello, block.”, nonce 0 and the starting target. A running search stops, and recorded search results are cleared.' },
  'lab.hash.message': fixed => (fixed
    ? { title: 'Message', text: 'The text that gets hashed. In this experiment it stays fixed, so both searches hash the same message and only the target and the nonce differ.' }
    : { title: 'Message', text: 'The text that gets hashed. Change one letter, a space or a period and the fingerprint below changes completely. Change it back and the old fingerprint returns.' }),
  'lab.hash.nonce': fixed => (fixed
    ? { title: 'Nonce', text: '“Number used once”: a number hashed together with the message. Here the search sets it: it starts at 0 and counts up, one candidate per attempt, until the fingerprint meets the target.' }
    : { title: 'Nonce', text: '“Number used once”: a number hashed together with the message. A new nonce gives a completely different fingerprint. Mining means trying nonce after nonce until the fingerprint starts with enough zeros.' }),
  'lab.hash.next-nonce': { title: 'Next nonce', text: 'Add 1 to the nonce and hash again. Each nonce gives an unrelated fingerprint, so you cannot aim for zeros, only try. This is mining by hand; a search does the same much faster.' },
  'lab.hash.fingerprint': { title: 'Double SHA-256 fingerprint', text: 'The hash: SHA-256 applied twice, as in Bitcoin. The same input always gives the same 64 characters; any change gives a different result. There is no known way to work backwards from a wanted hash to an input.' },
  'lab.hash.target': (met, zeros, error) => {
    if (error) return { title: 'Waiting for valid input', text: 'The nonce field holds no whole number from 0 to 4,294,967,295, so nothing new is hashed. The fingerprint shows the last valid input.' };
    return met
      ? { title: 'Target met', text: `This fingerprint starts with ${zerosText(zeros)}, as the target asks. As a block it would be a valid proof of work: anyone can check it with a single hash.` }
      : { title: 'Target not met', text: `The target asks for a fingerprint that starts with ${zerosText(zeros)}. This one does not, so as a block it would be rejected. Try other nonces until one fits.` };
  },
  'lab.hash.target-select': { title: 'Target', text: 'How many zeros the fingerprint must start with. Each extra zero makes a match about 16 times rarer, so a search needs about 16 times more attempts on average. The target is hashed too, so changing it changes the fingerprint.' },
  'lab.hash.find': fromZero => ({ title: 'Find a nonce', text: `Let the computer try nonce after nonce, starting at ${fromZero ? '0' : 'the nonce shown'}, until the fingerprint meets the target. It checks at most ${LIMIT} candidates and stops at the first match.` }),
  'lab.hash.stop': { title: 'Stop search', text: 'Stop the search now. The nonce field keeps the last candidate tried, so you can go on by hand.' },
  'lab.hash.previous': { title: 'Previous hash', text: 'Show the full fingerprint from before your last change, to compare it character by character.' },
  'lab.hash.result-hash': { title: 'Hash', text: 'Show the full fingerprint this search found. It meets the target of its row.' },
  'lab.hash.searches': { title: 'Proof of work', text: 'A hash that meets the target proves that someone tried many nonces, because there is no shortcut. Each search below started at nonce 0 with the same message.' },
  'lab.hash.preimage': { title: 'What exactly are we hashing?', text: 'Show the exact 80 bytes that get hashed: a real Bitcoin block header. Your message, the target and the nonce each sit in it, so changing any of them changes the fingerprint.' },

  // ---------- chain lab: tabs ----------
  'lab.chain.repair': { title: 'Repair a chain', text: 'Three linked toy blocks. Change old data, watch the checks fail, then re-mine block after block until the chain is consistent again.' },
  'lab.chain.fork': { title: 'Competing branches', text: 'Two valid histories compete for new blocks. See which one is followed: only a branch with strictly more proof of work replaces the current one. Also try rewriting history.' },
  'lab.chain.merkle': { title: 'Prove a payment', text: 'Check that one payment is inside a block with only the block header and a few hashes, the way a light wallet does, without downloading the other payments.' },

  // ---------- chain lab: repair ----------
  'lab.chain.status': consistent => (consistent
    ? { title: 'Toy chain consistent', text: 'Every block passes every check: its stored hash fits its input and starts with a zero, and it stores the hash of the block before it (Block 1: the starting anchor).' }
    : { title: 'Toy chain inconsistent', text: 'At least one block fails a check, and so does every block after it. Re-mine in order, starting with the first invalid block.' }),
  'lab.chain.reset': { title: 'Reset chain lab', text: 'Put the three example blocks back: original data, nonces, stored hashes and links. A running re-mine stops.' },
  'lab.chain.valid': valid => (valid
    ? { title: 'Valid through here', text: 'This block and every block before it pass all checks.' }
    : { title: 'Invalid through here', text: 'This block or one before it fails a check. A block counts only if every earlier block is valid too.' }),
  'lab.chain.data': number => ({ title: `Block ${number} data`, text: 'What this block records; it stands in for payments. Editing it changes the block’s input, but the stored hash stays as it was, so the block fails its checks until you re-mine it.' }),
  'lab.chain.nonce': { title: 'Nonce', text: '“Number used once”: the number found so this block’s hash starts with a zero. Change it by hand and the hash no longer matches. Re-mining searches a new one, starting at 0.' },
  'lab.chain.previous': first => (first
    ? { title: 'Starting anchor', text: 'Block 1 has no block before it, so it stores 64 zeros as its starting point. Its link check compares against that.' }
    : { title: 'Previous stored hash', text: 'A copy of the stored hash of the block before, kept inside this block: the link of the chain. When re-mining gives that block a new hash, this copy no longer matches.' }),
  'lab.chain.stored': { title: 'Stored hash', text: 'The hash written down when this block was last mined. Editing data or nonce does not update it; that is how the checks notice a change.' },
  'lab.chain.check-hash': ok => (ok
    ? { title: 'Hash matches input', text: 'Hashing this block’s current input (data, nonce, previous stored hash and the other header fields) gives exactly the stored hash.' }
    : { title: 'Hash does not match input', text: 'Hashing the current input gives a different hash than the stored one: something changed after mining. Re-mining finds a new nonce and stores the new hash.' }),
  'lab.chain.check-target': ok => (ok
    ? { title: 'Stored hash meets target', text: 'The stored hash starts with a zero, the target for every toy block. That is its proof of work.' }
    : { title: 'Stored hash misses target', text: 'The stored hash does not start with a zero, so it is no valid proof of work.' }),
  'lab.chain.check-link': ok => (ok
    ? { title: 'Previous link matches', text: 'The previous stored hash equals the stored hash of the block before (for Block 1: the starting anchor). The link holds.' }
    : { title: 'Previous link does not match', text: 'This block still stores the old hash of the block before it, which was re-mined and got a new one. Re-mine this block to take in the new link.' }),
  'lab.chain.check-ancestors': ok => (ok
    ? { title: 'Earlier blocks valid', text: 'Every block before this one passes its checks.' }
    : { title: 'Earlier block invalid', text: 'A block before this one fails a check. A block is only valid on top of valid blocks, so repair the earlier one first.' }),
  'lab.chain.remine': number => ({ title: `Re-mine Block ${number}`, text: `Search nonces from 0 until Block ${number}’s hash starts with a zero (at most ${LIMIT} tries), then store that hash and the current link to the block before. A new hash breaks the next block’s link.` }),
  'lab.chain.stop': { title: 'Stop search', text: 'Stop this re-mine. No block changes: a new hash is stored only when a search succeeds.' },
  'lab.chain.inspect': number => ({ title: `Inspect Block ${number} input`, text: `Show the exact 80 bytes hashed for Block ${number}: version, previous stored hash, Merkle root (a hash of the data), time, target and nonce.` }),

  // ---------- chain lab: competing branches ----------
  'lab.fork.rounds': { title: 'New blocks', text: `The experiment mines at most ${ROUND_LIMIT} new blocks in total, on either branch.` },
  'lab.fork.competition': { title: 'Competition', text: 'Both branches share two blocks, then each has its own third block: equal work. Mining decides which pulls ahead. Choosing a scenario restarts the experiment.' },
  'lab.fork.rewrite': { title: 'Rewrite history', text: 'The attacker’s case: the alternative changes the first payment, so it starts over with 1 block against 3. It must catch up and then get ahead. Choosing a scenario restarts the experiment.' },
  'lab.fork.power': { title: 'Alternative hash power', text: 'The alternative branch’s share of all mining power; the original gets the rest. The share is each branch’s chance to find the next block. Changing it stops a running search; finished blocks stay.' },
  'lab.fork.run': state => ({
    run: { title: 'Run experiment', text: `Mine block after block until ${ROUND_LIMIT} new blocks exist. Each block goes to whichever branch finds a valid hash first; watch which history stays selected.` },
    stop: { title: 'Stop experiment', text: 'Stop mining. Finished blocks stay; the block being searched is dropped.' },
    retry: { title: 'Retry experiment', text: 'The last search failed. Finished blocks are safe; this mines on from where it stopped.' },
    done: { title: 'Experiment complete', text: `All ${ROUND_LIMIT} new blocks are mined. Reset the fork experiment to start again.` }
  }[state]),
  'lab.fork.mine-one': done => (done
    ? { title: 'Mine one block', text: `All ${ROUND_LIMIT} new blocks are mined. Reset the fork experiment to start again.` }
    : { title: 'Mine one block', text: 'Mine a single block, then stop. Whichever branch finds a valid hash first gets it.' }),
  'lab.fork.reset': { title: 'Reset fork experiment', text: 'Start this scenario over with its starting blocks. A running search stops; the hash power setting stays.' },
  'lab.fork.attempts': { title: 'Attempts and switches', text: 'Attempts: how many hashes the last search tried before a branch found a block, which is luck. A selection switch happens when the other branch gets more work and becomes the followed history.' },
  'lab.fork.ancestor': shared => (shared
    ? { title: 'Shared ancestor', text: 'Blocks both branches have in common. The two histories split after the last of them.' }
    : { title: 'Shared starting anchor', text: 'The branches share no block. Both start from the same root hash, 64 zeros, and differ from Block 1 on.' }),
  'lab.fork.selected': selected => (selected
    ? { title: 'Selected history', text: 'The history this local network model follows now: the fully valid branch with the most accumulated work. On a tie the current one stays.' }
    : { title: 'Competing history', text: 'A valid history that is not followed now. It replaces the selected one only with strictly more accumulated work.' }),
  'lab.fork.work': { title: 'Work units', text: `Accumulated proof of work. Each valid block adds ${BLOCK_WORK}: the average number of tries a hash starting with a zero takes. A block found by luck in fewer tries still adds ${BLOCK_WORK}.` },
  'lab.fork.inspect': number => ({ title: `Inspect block ${number}`, text: `Show Block ${number}’s nonce, its stored hash and the hash of the block before it, which links the two.` }),

  // ---------- chain lab: prove a payment ----------
  'lab.merkle.reset': { title: 'Reset example', text: 'Back to the 16-payment block with transaction 5 chosen. Undoes every edit to the payment text and the sibling hashes.' },
  'lab.merkle.size': size => ({ title: `${size.toLocaleString('en-US')} transactions`, text: `A block with ${size.toLocaleString('en-US')} payments. The proof needs one sibling hash per tree level: ${Math.ceil(Math.log2(size))} here. Doubling the payments adds only one hash.` }),
  'lab.merkle.saving': { title: 'Proof size', text: 'What a light client needs to check this one payment: the payment, a few sibling hashes and the 80-byte header, instead of every payment in the block.' },
  'lab.merkle.tx': position => ({ title: `Tx ${position}`, text: `Prove transaction ${position}: its proof path appears below. Choosing a payment undoes your edits.` }),
  'lab.merkle.pick': { title: 'Transaction number', text: 'Which payment to prove, counted from 0. The other payments stay hidden: the proof does not need them. A new number undoes your edits.' },
  'lab.merkle.header': { title: 'Block header', text: 'A light client, such as a phone wallet, keeps only the 80-byte block headers, not the full blocks. The Merkle root in the header is all it needs to check a proof.' },
  'lab.merkle.root': { title: 'Merkle root', text: 'One hash that sums up every payment in the block: hash the payments in pairs, then those results in pairs, up to a single hash. Change any payment and the root changes.' },
  'lab.merkle.block-hash': { title: 'Block hash', text: 'The double SHA-256 of the 80 header bytes; it starts with a zero (proof of work). The Merkle root is in the header, so the block hash depends on every payment too.' },
  'lab.merkle.inspect': { title: 'Inspect the 80 header bytes', text: 'Show the header field by field as raw bytes. The Merkle root above is one of the fields.' },
  'lab.merkle.text': { title: 'Payment text', text: 'The payment to prove. Its txid (transaction ID) is the double SHA-256 of this text. Change one character and the proof no longer reaches the header’s Merkle root.' },
  'lab.merkle.path': { title: 'Proof path', text: 'The way from the payment up to the root. At each level the current hash is paired with one sibling hash from the proof and hashed again; the last result must equal the Merkle root.' },
  'lab.merkle.sibling': side => ({ title: 'Sibling hash', text: `The neighbor hash at this tree level, part of the proof. It sits on the ${side === 'left' ? 'left, so it goes before' : 'right, so it goes after'} the current hash when the two are hashed together. Edit it to see the proof fail above.` }),
  'lab.merkle.computed': { title: 'Computed root', text: 'The root calculated from the payment and the proof path. The payment is proven only if it equals the header’s Merkle root.' }
};
