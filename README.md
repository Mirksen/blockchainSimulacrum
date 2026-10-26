# proofofwork.fyi

An interactive, browser-only blockchain learning experiment, originally built for CS50 in 2021. Mine blocks, race two miners, send simulated coins, change the difficulty or halving interval, and tamper with a transaction to see integrity checks fail.

This is a simplified model, not a Bitcoin wallet or network client. Coins have no monetary value. Keys and decorative demo seed words must never be used for real funds. All simulation state lives in memory; refreshing or resetting starts a new chain.

## Run locally

Use Node.js 22.22.2+, 24.15+ or 26+ and npm. The web app is React and Vite.

```sh
npm --prefix web ci
npm --prefix web run dev
```

Choose **Start demo** to mine the initial coins and distribute them. Create a transfer in **New Transaction**, then choose **Mine Next Block**. **Auto-mine** repeats the experiment; **Stop mining** cancels the active attempt. **Reset** creates fresh wallets and a new genesis block while retaining experiment settings.

Open **Experiment settings** to change difficulty, the coin's display name, target block time or the halving interval. Changes affect future blocks. Difficulty adapts every ten mined blocks. Difficulty is measured in leading hexadecimal zeros, so each additional zero makes a successful hash about sixteen times less likely.

## Verify

```sh
npm --prefix web run check
npm --prefix web run deploy:check
npm --prefix web run test:browser
npm --prefix web run preview
```

The tests cover invalid transaction values and pending balances, tampering, wallet initialization, concurrent starts, stopped halving attempts, reset, setting changes and demo distribution. `test:browser` needs Google Chrome. It starts and stops a local preview, exercises the complete demo/transfer/tamper/reset flow and checks five viewport widths. Set `BASE_URL` to check an already running site instead; screenshots go to the OS temporary directory (override with `SCREENSHOT_DIR`).

The deployment check builds the public files and runs a Cloudflare dry run; it does not publish anything or establish live-domain acceptance.

## Hosting on Cloudflare

[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) serves only `web/dist`. No database, application server, API keys or visitor accounts are needed. The pinned project Wrangler configuration is in `web/wrangler.jsonc`; use the project scripts rather than a global Wrangler installation. `_headers` supplies a same-origin content policy and basic response headers. The app loads no remote fonts or analytics.

The default environment has no custom domain. The explicitly selected `production` environment binds **proofofwork.fyi** to the Worker **proofofwork-fyi** in the configured account.

Before a production deployment, verify the authenticated account, existing Worker and domain/DNS bindings, and obtain the release authorization required by your workflow. A browser login and Wrangler authentication are separate. Authenticate through a local OAuth flow or a locally supplied scoped token; never put a token in Git or chat.

```sh
# Authenticated account read, then explicit production release:
npm --prefix web exec -- wrangler whoami
npm --prefix web run deploy:production
```

After publication, verify HTTPS, response headers, asset loading and the Start demo → transfer → mine → tamper → reset flow on the actual domain. A successful upload or local dry run alone does not verify the live site.

## Source layout

- `web/src/lib/blockchain.js`: participants, signed transactions, blocks and integrity checks.
- `web/src/hooks/useBlockchain.js`: simulation state, miner race, cancellation and demo setup.
- `web/src/components/`: wallets, chain explorer, controls and detail dialogs.
- `web/src/__tests__/`: deterministic lifecycle and model regression tests.
- Root `main.js`, `blockchain.js`, `config.js`: historical terminal implementation.

[Original video demonstration](https://youtu.be/sYBxClODaJw)
