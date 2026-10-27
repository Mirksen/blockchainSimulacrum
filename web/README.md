# Proof of Work web app

See the [project README](../README.md) for local setup, simulation behavior, checks and Cloudflare deployment.

From this directory: `npm ci`, then `npm run dev`. Run `npm run check` before release and `npm run deploy:check` to validate the production package without publishing it.

## Demo wallet recovery

Each participant receives a new English [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) phrase: 128 bits from the browser's cryptographic random-number generator, encoded as 12 words with a checksum from the complete 2,048-word list. Missing secure randomness fails rather than falling back to `Math.random`.

Both creation and recovery require Web Crypto (`crypto.getRandomValues`): the BIP32 library also uses secure randomness for scalar-multiplication blinding. This protection does not change the deterministic key. Neither operation has an insecure fallback.

The phrase is converted to a BIP39 seed with an **empty passphrase**, then [BIP32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) derives the secp256k1 key at **`m/44'/0'/0'/0/0`** using `@scure/bip39` and `@scure/bip32`. The simulator continues to identify wallets by uncompressed hexadecimal public keys, not Bitcoin addresses.

`Participant.fromSeedPhrase(name, phrase, isMiner = false)` restores the same private/public key pair in memory. Recovery accepts valid English BIP39 phrases of 12, 15, 18, 21 or 24 words; it applies Unicode NFKD, trims surrounding whitespace and collapses whitespace between words. Unknown words, incorrect checksums, wrong word counts, uppercase words and non-string input are rejected. Names and miner settings do not affect key derivation. Additional BIP39 passphrases are not supported.

The participant details' **Verify recovery** button derives a fresh in-memory key from its displayed phrase and compares its public key with the current participant. This leaves the participant, settings and ledger unchanged. It is a recovery demonstration, not a wallet-import flow.

Phrases and keys are never sent to telemetry or stored persistently. A reset/reload discards the in-memory blockchain, transactions and participant settings; a phrase recovers the key only, not that history. Old decorative demo words cannot recover old keys. Use this application only for simulation, never with real funds or a real wallet's recovery phrase.
