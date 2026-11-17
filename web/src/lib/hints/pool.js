// Hints for the Leaderboard page (PoolPanel, MinerProfile, RoundHistory). Format and tone:
// see ./index.js. The catalog ships with the leaderboard, not with the first page: its
// components take `hint` and `term` from here. The ticker on the workbench and the details
// dialogs load with the first page (./details.js).
import { ROUND_WINDOW } from '../../../../shared/pool-proof.mjs';
import { createHints } from './index';

export const POOL_HINTS = {
  // ---------- leaderboard page ----------
  'pool.back': { title: 'Back to simulator', text: 'Return to the workbench and stop mining on this page. Your accepted blocks stay on the leaderboard.' },
  'pool.recent': { title: `Last ${ROUND_WINDOW} blocks`, text: `Each name ranks by its smallest hash in rounds tied to the latest ${ROUND_WINDOW} Bitcoin blocks (about a day). Older rounds still count toward the all-time ranking.` },
  'pool.all-time': { title: 'All time · top 20', text: 'The 20 names with the best single hash on this leaderboard, from any round.' },
  'pool.bitcoin-block': height => ({ title: `Bitcoin block #${height}`, text: `Opens block #${height} of the real Bitcoin chain on mempool.space, in a new tab. Leaderboard rounds are tied to recent Bitcoin blocks like this one, so the work cannot be done before they existed.` }),
  'pool.genesis': { title: 'Genesis', text: 'The first block of the simulator’s chain. Its hash ties leaderboard entries to this experiment. The Bitcoin block shown here anchors the genesis block.' },
  'pool.mine-title': { title: 'Keep mining', text: 'After your browser finds a match, it raises the goal by one leading zero. Each round starts with a fresh goal.' },
  'pool.name': { title: 'Name on the leaderboard', text: 'The name your blocks count for. It is written into every block you mine and shown publicly. 3–20 letters, digits or hyphens. Names are not unique and there is no account. Locked while mining.' },
  'pool.join': { title: 'Start mining', text: 'Start mining under this name. Your browser asks the leaderboard for a round and searches until you press Stop. Every better hash it finds is sent and checked.' },
  'pool.stop': { title: 'Stop', text: 'Stop the search in your browser. Blocks already accepted stay on the leaderboard.' },
  'pool.round': { title: `Round`, text: `The recent Bitcoin block your blocks are tied to. Its hash goes into each block, so the work cannot be done ahead of time. When it is no longer one of the last ${ROUND_WINDOW} Bitcoin blocks, a new round starts.` },
  'pool.attempts': { title: 'Attempts this round', text: 'How many hashes your browser has tried in the current round. Almost all of them miss: each extra leading zero takes about 16 times more tries.' },
  'pool.rate': { title: 'Hashes per second', text: 'How many block headers your browser hashes each second during this search.' },
  'pool.accepted': { title: 'Accepted blocks', text: 'Blocks you sent from this page that the leaderboard checked and accepted. Within a round, each one has at least one more leading zero than the one before.' },
  'pool.best': { title: 'Your best this round', text: 'Leading zeros and difficulty of your best hash accepted from this page in this round. The next block you send needs at least one more zero.' },
  'pool.rank': { title: 'Rank', text: 'The smallest hash ranks first. When two hashes have the same number of leading zeros, the remaining digits decide.' },
  'pool.miner-name': { title: 'Name', text: 'The public name recorded in the block. Blocks with the same name share one row.' },
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
  'pool.share-find': { title: 'Share best find', text: 'Share your name, best retained hash and profile link with another app. If sharing is unavailable, copy them instead. Nothing is posted until you choose where to send it.' },
  'pool.own-profile': { title: 'Your personal bests', text: 'Open the blocks kept under your current miner name, with its ranks and best hashes. Names are public, shared labels, not accounts.' },
  'pool.round-rank': { title: 'Rank in this round', text: 'This name’s place among retained visible names mining the same Bitcoin block. The smallest hash leads.' },
  'pool.personal-window': { title: `Recent personal best`, text: `The count and best hash kept for this name in the last ${ROUND_WINDOW} Bitcoin blocks. All-time figures also include finished rounds. Evicted weak entries no longer count.` },
  'pool.finished-rounds': { title: `Finished rounds`, text: `Up to 20 recent rounds whose Bitcoin block has left the ${ROUND_WINDOW}-block window. The smallest retained hash wins. Counts cover retained visible entries, not every block ever mined.` },
  'pool.copy-link': { title: 'Copy link', text: 'Copy this profile’s address to your clipboard.' },
  'pool.you': { title: 'You', text: 'This is the name you mine under. Others can mine under the same name too.' },
  'pool.rank-recent': { title: `Rank · last ${ROUND_WINDOW} blocks`, text: `This name’s place among rounds whose Bitcoin block is one of the last ${ROUND_WINDOW} (about a day). A dash means no block in that window.` },
  'pool.rank-all-time': { title: 'Rank · all time', text: 'This name’s place by its best hash from any round.' },
  'pool.rounds': { title: 'Rounds', text: 'The Bitcoin blocks this name mined for. For each round the leaderboard keeps the best block and counts the others.' },
  'pool.blocks-sent': { title: 'Blocks sent', text: 'All blocks of this name the leaderboard accepted, over the rounds listed below.' },
  'pool.profile-best': { title: 'Best hash', text: 'The smallest hash this name found in any listed round. The highlighted leading zeros show how rare it is.' },
  'pool.round-block': { title: 'Bitcoin block', text: 'The round: a real Bitcoin block whose hash went into this name’s blocks, so the work cannot have been done before it existed. Click the number to look it up.' },
  'pool.round-blocks': { title: 'Blocks', text: 'How many blocks this name sent in this round that the leaderboard accepted. Only the best one is kept.' },
  'pool.found': { title: 'Found', text: 'When the leaderboard received this round’s best block, in your local time.' }
};

export const { hint, term } = createHints(POOL_HINTS);
