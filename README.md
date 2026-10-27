# proofofwork.fyi

An interactive blockchain learning experiment, originally built for CS50 in 2021. Mine blocks, race two miners, send simulated coins, change the difficulty or halving interval, and tamper with a transaction to see integrity checks fail. Mining runs in your browser; an optional mining pool lets visitors compare verified work on a shared leaderboard.

This is a simplified model, not a Bitcoin wallet or network client. Coins have no monetary value. Keys and decorative demo seed words must never be used for real funds. All simulation state lives in memory; refreshing or resetting starts a new chain.

## Run locally

Use Node.js 22.22.2+, 24.15+ or 26+ and npm. The web app is React and Vite.

```sh
npm --prefix web ci
npm --prefix web run dev
```

Choose **Start demo** to mine the initial coins and distribute them. Create a transfer in **New Transaction**, then choose **Mine Next Block**. **Auto-mine** repeats the experiment; **Stop mining** cancels the active attempt. **Reset** creates fresh wallets and a new genesis block while retaining experiment settings.

Open **Experiment settings** to change difficulty, the coin's display name, target block time or the halving interval. Changes affect future blocks. Difficulty adapts every ten mined blocks. Difficulty is measured in leading hexadecimal zeros, so each additional zero makes a successful hash about sixteen times less likely.

Choose **Hash lab** in the header to edit a message and nonce, compare fingerprints, and search for a hash with one to three leading zeros. Search checks at most 50,000 candidates per run and can be stopped; editing an input cancels it. The lab uses independent temporary state and never changes the chain or wallets. **Back to simulator** or Escape closes it; reopening starts a fresh lab.

Choose **Chain lab** to experiment with three linked text blocks. Change Block 1's data: its stored hash stays unchanged, while the recomputed fingerprint reveals the edit. Later blocks can still pass their own checks while depending on an invalid earlier block. Re-mine each affected block in order to adopt the preceding stored hash and find a new nonce with one leading hex zero. Repairing one block leaves its successors untouched, so their links need attention next. Each search starts at zero, checks at most 50,000 candidates and can be stopped. Edits, reset and close cancel pending searches; only a successful search replaces a stored block. This isolated demonstration has no signatures, balances or network consensus and never changes the simulator.

Choose **Start guided experiments** for a three-step learning path: change a message’s fingerprint, find nonces for one and two leading zeros with the same input, then change Block 1 and repair the linked chain while keeping that edit. Each step unlocks from the actual experiment; navigation cannot mark it complete. Progress survives closing the guide within the current page, and **Restart learning path** clears it. Guide experiments never change simulator blocks or wallets. The two-target comparison explains probability rather than promising a fixed timing or attempt ratio.

## How mining works here

Every hash attempt, in the simulator and in all labs, goes through one search module (`web/src/lib/powSearch.js`). In the browser it runs in a Web Worker, so the page stays responsive while miners race. The constant part of the block header is absorbed into SHA-256 once (the midstate); each attempt only hashes the nonce and the rest. Blocks commit to their transactions through a Merkle transaction root, like Bitcoin's block header: change one transaction and the recomputed root, and with it the block hash, no longer match. Why the work stays in your browser, and when a server is used instead, is recorded in [ADR 0001](docs/adr/0001-proof-of-work-runs-in-the-browser.md); the domain terms are in [CONTEXT.md](CONTEXT.md).

## Mining pool and leaderboard

Choose **Mining pool**, pick a public name and join. The pool server hands out a short-lived, signed challenge; your browser searches for a nonce whose hash meets the pool's target; the server re-hashes every submitted share before it counts. Changed browser code cannot fake work, and a share cannot be reused or credited to another name. Each share earns the expected work of its target (16 to the power of the required zeros); a luckier hash only improves your best hash. Faster hardware counts too: that is proof of work. Only the chosen name and accepted shares are stored; there are no accounts. Blocks of the local simulator never count, because they exist only in one browser. If the server is unavailable, the simulator keeps working.

Public names pass a moderation check: the server folds a name (case, accents, ß, digit look-alikes, separators) and refuses it if it contains a blocked term or equals a reserved one; an operator can hide a name later. The blocked terms in `server/data/blocked-names.txt` come from the English and German lists of [List of Dirty, Naughty, Obscene, and Otherwise Bad Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) by the LDNOOBW contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); this project adds German umlaut spellings when it loads them.

The server lives in `server/` (Node 24, no runtime dependencies, SQLite). `deploy/lab/` runs it as a self-contained Compose stack with its own Cloudflare tunnel; see `deploy/lab/README.md`.

## Verify

```sh
npm --prefix web run check
npm --prefix web run deploy:check
npm --prefix web run test:browser
npm --prefix web run preview
npm --prefix server test
```

The tests cover invalid transaction values and pending balances, tampering, the Merkle transaction root, block acceptance, the search module (midstate digests, weighted races, stop and limits), wallet initialization, concurrent starts, stopped halving attempts, reset, setting changes and demo distribution. Browser and server hashing are pinned to the same vectors in `shared/share-vectors.json`. The server tests cover forged, expired, duplicate and tampered shares, rate limits and CORS. `test:browser` needs Google Chrome. It starts and stops a local preview, exercises the complete demo/transfer/tamper/reset flow and checks five viewport widths. Set `BASE_URL` to check an already running site instead; screenshots go to the OS temporary directory (override with `SCREENSHOT_DIR`).

The deployment check builds the public files and runs a Cloudflare dry run; it does not publish anything or establish live-domain acceptance.

## Hosting on Cloudflare

[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) serves only `web/dist`; these are plain files any static host could serve. The simulator needs no database, application server or visitor accounts. The leaderboard API is served separately at `api.proofofwork.fyi` from the lab stack in `deploy/lab/`. Optional analytics uses only a public PostHog project ingestion token. The pinned project Wrangler configuration is in `web/wrangler.jsonc`; use the project scripts rather than a global Wrangler installation. `_headers` supplies a same-origin content policy and basic response headers. The app loads no remote fonts or tracking scripts. Explicit opt-in event requests go only to PostHog EU.

The default environment uses the separate Worker **proofofwork-fyi-preview** and has no custom domain. The explicitly selected `production` environment binds **proofofwork.fyi** to the Worker **proofofwork-fyi** in the configured account.

Before a production deployment, verify the authenticated account, existing Worker and domain/DNS bindings, and obtain the release authorization required by your workflow. A browser login and Wrangler authentication are separate. Authenticate through a local OAuth flow or a locally supplied scoped token; never put a token in Git or chat.

```sh
# Authenticated account read, then explicit production release:
npm --prefix web exec -- wrangler whoami
npm --prefix web run deploy:production
```

After publication, verify HTTPS, response headers, asset loading and the Start demo → transfer → mine → tamper → reset flow on the actual domain. A successful upload or local dry run alone does not verify the live site.

## Source layout

- `web/src/lib/blockchain.js`: participants, signed transactions, the Merkle transaction root, block headers, candidate preparation and block acceptance, integrity checks.
- `web/src/lib/powSearch.js` and `powSearch.worker.js`: the one nonce search (midstate, weighted race, Web Worker adapter).
- `web/src/hooks/useBlockchain.js`: simulation state, miner race orchestration, cancellation and demo setup.
- `web/src/components/PoolPanel.jsx` and `web/src/lib/poolApi.js`: the mining pool view.
- `server/`: the leaderboard server; `deploy/lab/`: its Compose stack; `shared/`: hash vectors used by both sides.
- `web/src/components/HashLab.jsx` and `web/src/lib/hashLab.js`: the isolated hashing experiment.
- `web/src/components/`: wallets, chain explorer, controls and detail dialogs.
- `web/src/__tests__/`: deterministic lifecycle and model regression tests.
- Root `main.js`, `blockchain.js`, `config.js`: historical terminal implementation.

[Original video demonstration](https://youtu.be/sYBxClODaJw)


## Optional PostHog EU analytics

Set `VITE_POSTHOG_PROJECT_TOKEN` in `web/.env.production.local` or the build environment, using the **public ingestion token** from the dedicated proofofwork.fyi EU project. See `web/.env.example`. The build rejects personal/secret key formats. A Vite variable is public client configuration: never put management credentials there. Without configuration, the app still works and usage sharing stays unavailable.

Visitors choose **Usage sharing** near the experiment settings. It defaults to off and respects browser privacy signals. The preference is the only analytics value saved locally. A random visit identifier stays in memory and is replaced after opt-out; person profiles are disabled. There is no replay, DOM/form/clipboard autocapture, analytics script loading, persisted request queue, retry or unload beacon. Opt-out aborts pending requests and prevents subsequent sends; it cannot undo requests already received by PostHog. Offline/failed sends are dropped and never block the simulation.

The small transport uses the documented [Capture API](https://posthog.com/docs/api/capture), including the [manual exception schema](https://posthog.com/docs/error-tracking/installation/manual). CSP permits only the EU ingestion host in addition to this site's own resources. Every event has a generated event ID, app/schema identifier and client timestamp. Allowed operation fields are defined and tested in `web/src/lib/telemetry.js`:

| Events | Permitted operation data |
| --- | --- |
| `app_opened` | No extra operation fields |
| `demo_started`, `demo_completed`, `demo_failed`, `demo_cancelled` | Difficulty, resulting block count or a fixed failure code |
| `mining_started`, `mining_completed`, `mining_cancelled`, `mining_failed` | Difficulty, elapsed milliseconds, attempt/miner/transaction counts, block height or a fixed reason |
| `transaction_created`, `transaction_rejected` | Source, count, pending count or a fixed failure code |
| `difficulty_changed`, `settings_changed` | Previous/current difficulty, fixed setting name, numeric/boolean/enumerated value |
| `tamper_applied`, `chain_reset` | Block height or previous mined-block count |
| `$exception` | Fixed source/type, generic message and positions in known loaded app assets |

Keys, seed words, wallet/participant names, transaction references, arbitrary error messages, query strings and other free-text bodies are not included. Mining summaries are emitted at operation boundaries, never for individual hashes or progress renders.

The browser check intercepts PostHog requests; it never sends test data to a real dataset. CI supplies a synthetic public token and requires the positive consent/privacy path. To run that path locally:

```sh
VITE_POSTHOG_PROJECT_TOKEN=phc_syntheticproject EXPECT_POSTHOG=1 npm --prefix web run test:browser
```

This produces a test build. Before release, rebuild through the normal production command with the real public project token. Actual acceptance also requires locating a uniquely generated synthetic event in the correct EU project's stored events; a successful capture response alone is insufficient. Authentication and that live evidence remain separate from mock coverage and CI.

The manually dispatched **Production acceptance** workflow checks the fixed public domain from a hosted runner. Supply the checked release source and four asset SHA-256 digests as `release_manifest`, and only the SHA-256 fingerprint of the public ingestion token as `token_fingerprint`. Browser checks and expected headers come from that declared release commit, so newer unpublished features do not change its acceptance criteria. The workflow checks normal TLS, published bytes/headers and the full simulator/hash-lab flow. Explicitly enabling its synthetic probe then sends nine anonymous usage/error events; its artifact contains the exact event IDs for separate stored-data verification. It has no deployment permissions, management credentials or automatic production trigger. Anonymous test events have no person profile; resolve the synthetic error issue after checking it, and do not delete unrelated project data.
