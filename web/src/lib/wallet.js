import { HDKey } from '@scure/bip32';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export const WALLET_DERIVATION_PATH = "m/44'/0'/0'/0/0";

// One English BIP39 phrase, empty passphrase, and one fixed BIP32 child key.
// Never log these values or attach them to telemetry or persistent storage.
export function deriveWallet(seedPhrase = generateMnemonic(wordlist, 128)) {
  if (typeof seedPhrase !== 'string') {
    throw new Error('Enter a valid English BIP39 recovery phrase.');
  }
  const mnemonic = seedPhrase.normalize('NFKD').trim().replace(/\s+/gu, ' ');
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Enter a valid English BIP39 recovery phrase.');
  }

  const seed = mnemonicToSeedSync(mnemonic, '');
  let root;
  let child;
  try {
    root = HDKey.fromMasterSeed(seed);
    child = root.derive(WALLET_DERIVATION_PATH);
    const privateKey = child.privateKey;
    if (!privateKey) throw new Error('Unable to derive the demo wallet.');
    return { seedPhrase: mnemonic, privateKey };
  } finally {
    seed.fill(0);
    child?.wipePrivateData();
    root?.wipePrivateData();
  }
}
