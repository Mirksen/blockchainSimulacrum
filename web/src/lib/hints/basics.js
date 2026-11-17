// Hints for the Basics course (components/basics/). Format and tone: see ./index.js.
// The catalog ships with the course, not with the first page: the scenes take `hint` and
// `term` from here.
import { createHints } from './index';

export const BASICS_HINTS = {
  // ---------- course host ----------
  'basics.back': { title: 'Back to simulator', text: 'Return to the simulator. Completed scenes stay complete, and your chain and wallets are unchanged.' },
  'basics.reset': { title: 'Reset scene', text: 'Restore this scene’s starting values and stop any running search or draw. Completed scenes stay complete.' },
  'basics.scene': (number, title, status) => ({ title: `Scene ${number}: ${title}`, text: `Open this scene (${status}). Every scene can be opened at any time, in any order.` }),
  'basics.continue': { title: 'Continue', text: 'Open the next scene of the Basics course.' },
  'basics.bridge.continue': { title: 'Continue', text: 'Leave the Basics course and go on to the next part of the mission track.' },

  // ---------- the copy problem ----------
  'basics.copy.photo': { title: 'Send photo to Bob', text: 'Send Alice’s photo to Bob. Watch what Alice still has afterwards.' },
  'basics.copy.coin-bob': { title: 'Send coin to Bob', text: 'Alice pays Bob her one coin. Without a shared list it is sent like a photo: as a copy.' },
  'basics.copy.coin-carol': { title: 'Send same coin to Carol', text: 'Try to pay the very same coin a second time, to Carol. First send it to Bob.' },
  'basics.copy.list': { title: 'Shared list', text: 'The shared list records who paid whom and rejects a second payment of the same coin. Toggling this switch resets the example’s coin payments.' },

  // ---------- fingerprints ----------
  'basics.text': { title: 'Your text', text: 'Exactly this text goes into SHA-256. Letters, spaces and capitals all count. Its fingerprint updates as you type.' },
  'basics.hash': { title: 'Fingerprint (SHA-256 hash)', text: 'A 64-character code using 0–9 and a–f, calculated from the entire text. The same text always gives the same hash. You cannot reverse the hash to recover the text; you can only test guesses.' },
  'basics.drawing': { title: 'Drawn fingerprint', text: 'A picture drawn from the 64 characters, so you can compare two hashes at a glance. Equal hashes give equal pictures.' },
  'basics.first': { title: 'Your first fingerprint', text: 'The fingerprint of the first text you typed. Type that text again later and the same fingerprint returns.' },
  'basics.compare.left': { title: 'Original text', text: 'This text stays fixed, so you can compare its fingerprint with the fingerprint of your copy.' },
  'basics.compare.right': { title: 'Your copy', text: 'Change one character: a letter, a digit or a space. The counter below says how many of the 64 hash characters differ.' },

  // ---------- guessing ----------
  'basics.guess.input': { title: 'Your text', text: 'Type your name or anything else. Every new text is one roll: its fingerprint starts with one of 16 characters, 0–9 or a–f.' },
  'basics.guess.roll': { title: 'Roll', text: 'Add a number to your text, or increase its trailing number by one, then hash the result. Each new text is like a fresh roll of a 16-sided die.' },
  'basics.guess.auto': { title: 'Roll automatically for 00', text: 'Let the computer increase the number until the fingerprint starts with 00. This takes 256 tries on average. The search stops at a match or after 50,000 tries.' },
  'basics.guess.stop': { title: 'Stop', text: 'Stop rolling automatically. The last text tried stays visible.' },
  'basics.guess.proof': { title: 'Your first proof', text: 'The text and fingerprint you found. Verify them with any SHA-256 text tool. Reset scene clears this proof.' },
  'basics.guess.die': { title: '16-sided die', text: 'Shows the fingerprint’s first character. Each new text is like a fresh roll, but the same text always gives the same result.' },
  'basics.nonce': { title: 'Nonce', text: '“Number used once”: the number you change to get another fingerprint. In a Bitcoin block it has its own field.' },
  'basics.miner': { title: 'Miner', text: 'A computer that tries different block inputs to find a hash that meets the difficulty target. The first valid result can earn the next block’s reward.' },

  // ---------- the draw ----------
  'basics.draw.run': { title: 'Run the draw', text: 'Hal, Dorian and Laszlo roll in turn for the next page. The first fingerprint that starts with 00 wins the page and its reward.' },
  'basics.draw.postage': { title: 'Postage', text: 'Every roll costs a little computing work. The total work includes every writer’s attempts, including those that did not win.' },

  // ---------- sealed pages ----------
  'basics.seal': { title: 'Seal', text: 'A fingerprint calculated from the previous seal, this page’s text and its lucky number. Changing any input invalidates the stored seal.' },
  'basics.seal.previous': { title: 'Previous seal', text: 'The previous page’s seal, stored in this page. Page 1 has no predecessor, so it stores 64 zeros.' },
  'basics.seal.number': { title: 'Lucky number', text: 'A number hashed with the page. With Guessing off, any number works. Otherwise, Repair tries 0, 1, 2… until the seal has the required leading zeros.' },
  'basics.seal.text': number => ({ title: `Page ${number} text`, text: `What page ${number} records. Editing leaves the stored seal unchanged. Choose Repair to calculate a new seal.` }),
  'basics.seal.guessing': { title: 'Guessing', text: 'The number of leading zeros required in each seal. Off accepts any hash. Each extra zero makes a match 16 times less likely. Changing this setting creates a fresh, valid notebook.' },
  'basics.seal.repair': { title: 'Repair', text: 'Calculate new seals for every page in order, each using the previous page’s new seal. The result shows how many hashes this takes.' }
};

export const { hint, term } = createHints(BASICS_HINTS);
