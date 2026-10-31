# Proof of Work web app

See the [project README](../README.md) for local setup, simulation behavior, checks and Cloudflare deployment.

From this directory: `npm ci`, then `npm run dev`. Run `npm run check` before release and `npm run deploy:check` to validate the production package without publishing it.

## Optional missions and storage

Missions start hidden behind the Missions entry on every screen size. A first-visit
invitation points to it once; even ignoring it prevents another invitation on a later
visit. Start missions opens the tasks. Collapse the desktop rail or use Hide missions
on smaller screens to explore without coach marks. Closing the mobile task sheet
keeps guidance enabled; Hide missions disables it. Existing explicit visibility
choices are respected.

The browser stores the visibility choice (`proofofwork-rail-collapsed`), seen invitation
(`proofofwork-missions-intro-seen`) and mission progress (`proofofwork-missions`) in
localStorage. Opening or hiding missions does not erase progress. Completed missions
survive a reload; unfinished hash/chain-lab steps restart because the experiments'
state is temporary. These values are
local to this browser and site: clearing site data or using another browser/device
does not recover them. If storage is blocked, controls still work for the current
visit, but the choice and progress cannot survive a reload.

The pool's public display name is entered in Mining pool and remembered separately
as `proofofwork-pool-name`. Its server stores submitted proofs in SQLite.
Names are not unique: people using the same name share a leaderboard entry.
The name is not a login or a protected account, and it does not identify or sync
mission progress. Simulated wallets are separate from both.

## Demo wallet recovery

Each participant receives a new English [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) phrase: 128 bits from the browser's cryptographic random-number generator, encoded as 12 words with a checksum from the complete 2,048-word list. Missing secure randomness fails rather than falling back to `Math.random`.

Both creation and recovery require Web Crypto (`crypto.getRandomValues`): the BIP32 library also uses secure randomness for scalar-multiplication blinding. This protection does not change the deterministic key. Neither operation has an insecure fallback.

The phrase is converted to a BIP39 seed with an **empty passphrase**, then [BIP32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) derives the secp256k1 key at **`m/44'/0'/0'/0/0`** using `@scure/bip39` and `@scure/bip32`. Wallets use the compressed public key and pay to its mainnet-format P2PKH address.

`Participant.fromSeedPhrase(name, phrase, isMiner = false)` restores the same private/public key pair in memory. Recovery accepts valid English BIP39 phrases of 12, 15, 18, 21 or 24 words; it applies Unicode NFKD, trims surrounding whitespace and collapses whitespace between words. Unknown words, incorrect checksums, wrong word counts, uppercase words and non-string input are rejected. Names and miner settings do not affect key derivation. Additional BIP39 passphrases are not supported.

The participant details' **Verify recovery** button derives a fresh in-memory key from its displayed phrase and compares its public key with the current participant. This leaves the participant, settings and ledger unchanged. It is a recovery demonstration, not a wallet-import flow.

Phrases and keys are never sent to telemetry or stored persistently. A reset/reload discards the in-memory blockchain, transactions and participant settings; a phrase recovers the key only, not that history. Old decorative demo words cannot recover old keys. Use this application only for simulation, never with real funds or a real wallet's recovery phrase.
