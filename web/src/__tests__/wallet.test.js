import { afterEach, describe, expect, it, vi } from 'vitest';
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Participant, Transaction } from '../lib/blockchain';
import { deriveWallet, WALLET_DERIVATION_PATH } from '../lib/wallet';

// Public BIP39 vector: https://github.com/trezor/python-mnemonic/blob/master/vectors.json
const PHRASE = `${'abandon '.repeat(11)}about`;
const OTHER_PHRASE = `${'zoo '.repeat(11)}wrong`;
// Empty-passphrase BIP32 child independently calculated with Node/OpenSSL's
// PBKDF2/HMAC-SHA512/ECDH primitives, following BIP32 at the documented path.
const PRIVATE_KEY = 'e284129cc0922579a535bbf4d1a3b25773090d28c909bc0fed73b5e0222cc372';
const PUBLIC_KEY = '03aaeb52dd7494c361049de67cc680e83ebcbbbdbeb13637d92cd845f70308af5e';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('demo wallet recovery', () => {
  it('uses the supplied recovery phrase for the actual participant key', () => {
    const wallet = new Participant('Fixture Wallet', false, PHRASE);
    expect(wallet.privateKey === PRIVATE_KEY).toBe(true);
    expect(wallet.publicKey === PUBLIC_KEY).toBe(true);
  });

  it('matches the official BIP39 zero-entropy phrase and TREZOR seed vector', () => {
    expect(entropyToMnemonic(new Uint8Array(16), wordlist)).toBe(PHRASE);
    const seed = mnemonicToSeedSync(PHRASE, 'TREZOR');
    expect(Array.from(seed, byte => byte.toString(16).padStart(2, '0')).join('')).toBe(
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04'
    );
  });

  it('derives the independently checked empty-passphrase BIP32 child', () => {
    const wallet = Participant.fromSeedPhrase('Fixture Wallet', PHRASE);
    expect(WALLET_DERIVATION_PATH).toBe("m/44'/0'/0'/0/0");
    // Boolean comparisons keep accidental generated secrets out of failure logs.
    expect(wallet.privateKey === PRIVATE_KEY).toBe(true);
    expect(wallet.publicKey === PUBLIC_KEY).toBe(true);
    expect(wallet.seedPhrase === PHRASE).toBe(true);
  });

  it('uses secure entropy and a checksum instead of Math.random to create wallets', () => {
    const entropy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(bytes => bytes.fill(0));
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Insecure randomness used'); });
    const wallet = new Participant('Fixture Wallet', true);
    expect(entropy).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(entropy.mock.calls[0][0]).toHaveLength(16);
    expect(wallet.seedPhrase === PHRASE).toBe(true);
    expect(wallet.privateKey === PRIVATE_KEY).toBe(true);
    expect(wallet.isMiner).toBe(true);
  });

  it('fails closed when secure randomness is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => new Participant('Fixture Wallet')).toThrow(/crypto.getRandomValues/);
    // Recovery also needs secure randomness for the library's scalar blinding.
    expect(() => Participant.fromSeedPhrase('Fixture Wallet', PHRASE)).toThrow(/crypto.getRandomValues/);
  });

  it('recovers a newly generated phrase to exactly the same keys', () => {
    const wallet = new Participant('Fixture Miner', true);
    const recovered = Participant.fromSeedPhrase('Recovered Fixture', wallet.seedPhrase, true);
    expect(wallet.seedPhrase.split(' ').length === 12).toBe(true);
    expect(validateMnemonic(wallet.seedPhrase, wordlist)).toBe(true);
    expect(recovered.privateKey === wallet.privateKey).toBe(true);
    expect(recovered.publicKey === wallet.publicKey).toBe(true);
    expect(recovered.isMiner).toBe(true);
  });

  it('normalizes NFKD and surrounding/inter-word whitespace before recovery', () => {
    const input = ` \n${PHRASE.replaceAll(' ', '\t  ').replaceAll('a', 'ａ')}\u3000`;
    const wallet = Participant.fromSeedPhrase('Fixture Wallet', input);
    expect(wallet.seedPhrase === PHRASE).toBe(true);
    expect(wallet.publicKey === PUBLIC_KEY).toBe(true);
  });

  it.each([
    ['missing phrase', undefined], ['null', null], ['non-string', 42], ['empty', ''],
    ['wrong word count', 'abandon about'], ['invalid checksum', 'abandon '.repeat(12).trim()],
    ['unknown word', PHRASE.replace('about', 'notaword')], ['uppercase', PHRASE.toUpperCase()]
  ])('rejects %s without including input in the error', (_label, input) => {
    expect(() => Participant.fromSeedPhrase('Fixture Wallet', input)).toThrow('Enter a valid English BIP39 recovery phrase.');
  });

  it('accepts all standard English BIP39 lengths with a valid checksum', () => {
    for (const size of [16, 20, 24, 28, 32]) {
      const phrase = entropyToMnemonic(new Uint8Array(size), wordlist);
      const derived = deriveWallet(phrase);
      expect(derived.privateKey).toHaveLength(32);
      expect(derived.seedPhrase === phrase).toBe(true);
      derived.privateKey.fill(0);
    }
  });

  it('derives different keys for different phrases, independently of name/miner role', () => {
    const first = Participant.fromSeedPhrase('Fixture Wallet', PHRASE);
    const renamed = Participant.fromSeedPhrase('Fixture Miner', PHRASE, true);
    const other = Participant.fromSeedPhrase('Fixture Wallet', OTHER_PHRASE);
    expect(first.publicKey === renamed.publicKey).toBe(true);
    expect(first.privateKey === renamed.privateKey).toBe(true);
    expect(first.publicKey !== other.publicKey).toBe(true);
  });

  it('signs transactions for the original wallet after recovery', () => {
    const original = new Participant('Fixture Wallet', false, PHRASE);
    const recovered = Participant.fromSeedPhrase('Recovered Fixture', PHRASE);
    const recipient = Participant.fromSeedPhrase('Fixture Recipient', OTHER_PHRASE);
    const coin = { txid: 'ab'.repeat(32), vout: 0 };
    const tx = new Transaction({ inputs: [coin], outputs: [{ value: 1, scriptPubKey: recipient.scriptPubKey }] });
    tx.signInput(0, recovered.keyPair, original.scriptPubKey);
    expect(tx.verifyInput(0, original.scriptPubKey)).toBe(true);
    tx.signInput(0, recipient.keyPair, original.scriptPubKey);
    expect(tx.verifyInput(0, original.scriptPubKey)).toBe(false);
  });
});
