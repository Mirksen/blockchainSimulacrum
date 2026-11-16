// Hints for the Basics course (components/basics/). Format and tone: see ./index.js.
// The catalog ships with the course, not with the first page: the scenes take `hint` and
// `term` from here.
import { createHints } from './index';

export const BASICS_HINTS = {
  // ---------- course host ----------
  'basics.back': { title: 'Back to simulator', text: 'Leave the Basics course and return to the simulator. Your finished scenes stay finished; nothing here changes the simulator’s chain or wallets.' },
  'basics.reset': { title: 'Reset scene', text: 'Start this scene over with its starting values. A running search or draw stops. Finished scenes stay finished.' },
  'basics.scene': (number, title, status) => ({ title: `Scene ${number}: ${title}`, text: `Open this scene (${status}). Every scene can be opened at any time, in any order.` }),
  'basics.continue': { title: 'Continue', text: 'Open the next scene of the Basics course.' },
  'basics.bridge.continue': { title: 'Continue', text: 'Leave the Basics course and go on to the next part of the mission track.' },

  // ---------- the copy problem ----------
  'basics.copy.photo': { title: 'Send photo to Bob', text: 'Send Alice’s photo to Bob. Watch what Alice still has afterwards.' },
  'basics.copy.coin-bob': { title: 'Send coin to Bob', text: 'Alice pays Bob her one coin. Without a shared list it is sent like a photo: as a copy.' },
  'basics.copy.coin-carol': { title: 'Send same coin to Carol', text: 'Try to pay the very same coin a second time, to Carol. First send it to Bob.' },
  'basics.copy.list': { title: 'Shared list', text: 'Everyone keeps the same list of who paid whom. A coin belongs to whoever the list says, so a second payment of the same coin is refused. Switching takes the copied coins back.' },

  // ---------- fingerprints ----------
  'basics.text': { title: 'Your text', text: 'Exactly this text goes into SHA-256. Letters, spaces and capitals all count. Its fingerprint updates as you type.' },
  'basics.hash': { title: 'Fingerprint (SHA-256 hash)', text: 'A 64-character code calculated from every character of the text, using 0–9 and a–f. The same text always gives the same hash, on every computer. You cannot work back from it to the text.' },
  'basics.drawing': { title: 'Drawn fingerprint', text: 'A picture drawn from the 64 characters, so you can compare two hashes at a glance. Equal hashes give equal pictures.' },
  'basics.first': { title: 'Your first fingerprint', text: 'The fingerprint of the first text you typed. Type that text again later and the same fingerprint returns.' },
  'basics.compare.left': { title: 'Original text', text: 'This text stays fixed, so you can compare its fingerprint with the fingerprint of your copy.' },
  'basics.compare.right': { title: 'Your copy', text: 'Change one character: a letter, a digit or a space. The counter below says how many of the 64 hash characters differ.' },

  // ---------- guessing ----------
  'basics.guess.input': { title: 'Your text', text: 'Type your name or anything else. Every new text is one roll: its fingerprint starts with one of 16 characters, 0–9 or a–f.' },
  'basics.guess.roll': { title: 'Roll', text: 'Add a number to your text, or count the number up by one, and hash the new text. Each text is a fresh roll of a 16-sided die.' },
  'basics.guess.auto': { title: 'Roll automatically for 00', text: 'Let the computer count the number up until the fingerprint starts with 00. That takes about 256 rolls on average. Stops at a match or 50,000 tries.' },
  'basics.guess.stop': { title: 'Stop', text: 'Stop rolling automatically. The last text tried stays visible.' },
  'basics.guess.proof': { title: 'Your first proof', text: 'The exact text and fingerprint of your find. You can check them with any SHA-256 text tool. Reset scene clears it.' },
  'basics.guess.die': { title: '16-sided die', text: 'Shows the first character of the current fingerprint. You cannot aim for 0; every text lands at random, and the same text always lands the same way.' },
  'basics.nonce': { title: 'Nonce', text: '“Number used once”: the number you change to get another fingerprint. In a Bitcoin block it has its own field.' },
  'basics.miner': { title: 'Miner', text: 'A computer that tries numbers, billions per second, to find a fingerprint with enough zeros. The first to find one may write the next block.' },

  // ---------- the draw ----------
  'basics.draw.run': { title: 'Run the draw', text: 'Hal, Dorian and Laszlo roll in turn for the next page. The first fingerprint that starts with 00 wins the page and its reward.' },
  'basics.draw.postage': { title: 'Postage', text: 'Every roll costs a little computing work. All rolls of all writers together are the price paid for writing the pages.' },

  // ---------- sealed pages ----------
  'basics.seal': { title: 'Seal', text: 'The fingerprint of the seal before, this page’s text and its lucky number. Change anything and the seal no longer fits.' },
  'basics.seal.previous': { title: 'Previous seal', text: 'The seal of the page before, stored in this page. Page 1 has no page before it and stores 64 zeros.' },
  'basics.seal.number': { title: 'Lucky number', text: 'A number hashed with the page. With Guessing off any number fits; with zeros, a repair tries 0, 1, 2… until the seal starts with them.' },
  'basics.seal.text': number => ({ title: `Page ${number} text`, text: `What page ${number} records. Editing it leaves the stored seal as it was, so the seal no longer fits until you repair.` }),
  'basics.seal.guessing': { title: 'Guessing', text: 'How many zeros a seal must start with. Off: any seal fits. Each zero makes a fitting seal about 16 times rarer. Changing it starts a fresh, valid notebook.' },
  'basics.seal.repair': { title: 'Repair', text: 'Re-seal every page in order, each on top of the new seal before it, and count the hashes it takes.' }
};

export const { hint, term } = createHints(BASICS_HINTS);
