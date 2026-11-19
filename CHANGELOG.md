# Changelog

All notable changes to OnTrace are listed here.

## [1.6.0] — 2026-11-19

### Added
- **Address checker:** paste any address to learn what it is (wallet, empty or never-used wallet, token account, token mint, program, program-controlled address, app data, stake, vote or nonce account) and whether it's safe to send to. Token accounts show their owner wallet. Common programs are named.
- **Token permissions:** the token checker now lists every authority and Token-2022 extension (mint, freeze, metadata, permanent delegate, transfer fee, transfer hook, default frozen accounts, non-transferable, pausable, close authority, confidential transfers, interest-bearing, scaled balance), each with what it means and what it doesn't mean.
- **"How OnTrace checked this":** results show the data examined, when it was checked and what the check can't tell you.
- **Explained terms:** hover over or tap underlined terms for a plain-language explanation.
- **Display mode:** Beginner or Advanced (Settings). Advanced also shows full addresses, program IDs and technical names.

### Changed
- The dashboard search bar now classifies addresses: wallets are scanned, token mints open the token checker, and anything else opens the address checker.

## [1.5.1] — 2026-11-19

### Fixed
- The landing page and app screens now appear immediately, before the app script finishes downloading. On slow mobile connections the page could stay blank while it loaded.

## [1.5.0] — 2026-11-19

### Added
- **Landing page:** ontrace.space now opens on a landing page (hero, the three toolkits, how it works, safety, call to action). "Launch app" opens the app.
- **Dashboard:** the app opens on a wallet dashboard showing health score, what's lowering it, portfolio value, open approvals, risky tokens, SOL to reclaim (with a one-click reclaim), riskiest tokens, recent token checks and a holdings breakdown. Scanning is read-only and never asks for a signature.
- **One search bar:** paste a wallet, token or transaction signature at the top of any page. Signatures open the transaction inspector, token mints open the token checker, and anything else is scanned as a wallet.
- **Recent checks:** the last tokens you checked are remembered in this browser and shown on the dashboard.

### Changed
- **Sidebar navigation:** every tool is in a left sidebar grouped into Overview, Security, Investigate and Tools, with Settings and Docs at the bottom. On phones the sidebar opens from a menu button.
- **New mark:** a lime trace line ending in a magenta dot, used in the app and landing page header.
- Connecting a wallet now scans it automatically.
- Tool links still work by URL, e.g. `ontrace.space/#swap` or `ontrace.space/#check`.

## [1.4.0] — 2026-11-19

### Changed
- **Positioning:** homepage leads with one promise — *Understand your wallet. Investigate what you don't trust. Take control of your on-chain activity.* Tools are grouped under Understand, Investigate (highlighted) and Take control. Tabs reordered to lead with understanding and investigation.
- **Ratings:** the top risk level is renamed from "Safe" to **"No major red flags"**, because passing automated checks doesn't establish that a token is safe.
- **Fees wording:** "No OnTrace platform fees — standard Solana network fees apply" everywhere.
- **RPC wording:** clarified that ontrace.space has a built-in connection and needs no setup; the "configure an RPC" message now only applies to self-hosted copies.

### Added
- **Audit status** on the Security page and in SECURITY.md: not yet independently audited.

## [1.3.0] — 2026-11-19

### Security
- **Transaction guard:** every transaction is checked and simulated before the wallet opens. Blocks wrong fee payer, unexpected programs, approvals, authority changes, on-chain failures, ownership hand-overs, new delegates, unexpected token outflows, short swap output and excess SOL spend.
- **No third-party code:** Solana libraries bundled into `vendor/solana.bundle.js`; Orbitron font self-hosted. Google Fonts and esm.sh removed.
- **Content Security Policy** on every page; app code moved out of inline scripts into `app.js` and `boot.js`.
- **Frame protection** against clickjacking.
- **Custom RPC allowlist** for user-supplied RPC URLs.

## [1.2.0] — 2026-11-19

### Added
- **Documentation** at `ontrace.space/docs.html`: getting started, connecting on desktop and mobile, networks and settings, Solana basics, step-by-step guides for every tool, risk ratings, health score, safety guide, troubleshooting, glossary and a developer section. Linked from every page.

### Fixed
- Cleanup buttons now unlock automatically after connecting a wallet (the existing scan re-runs), and the page explains why buttons are locked on read-only scans.
- Connect button shows "Loading…" until the app is ready, with a warning if loading is very slow.

## [1.1.0] — 2026-11-19

### Added
- **Front page intro**: what OnTrace does, six feature cards that jump to each tool, trust points and a "Scan my wallet" button. Can be hidden (and brought back from the footer).
- **Wallet picker**: a proper connect dialog listing detected wallets.
- **Mobile support**: on phones with no wallet injected, "Open in Phantom" and "Open in Solflare" buttons open OnTrace inside the wallet's browser. On desktop, install links are shown.
- **FAQ**, **Security** and **Terms & Privacy** pages, linked from the footer.
- Footer links to GitHub and the new pages.
- Deep links to tools via the URL, e.g. `ontrace.space/#swap`.

## [1.0.1] — 2026-11-19

### Improved
- Trending now checks each token's on-chain creator permissions (mint authority, freeze authority, Token-2022 extensions) and shows the main reason under each rating.

## [1.0.0] — 2026-11-19

First public release.

### Portfolio & cleanup
- Wallet scan across Token Program and Token-2022 accounts, with portfolio value and a 0–100 health score
- Read-only scan of any address
- Reclaim SOL from empty token accounts (batched, 20 per transaction)
- Risk ratings on every token with listed reasons
- Burn & reclaim junk tokens with confirmation
- Approvals manager: delegate type labels, select-all, bulk revoke
- Unwrap wSOL

### Trading & tools
- Swap via Jupiter with automatic risk check, slippage presets, price-impact warning and risk acknowledgement
- Multi-send SOL or tokens with list validation, duplicate detection and automatic recipient account creation
- Token creator (Token-2022 + on-chain metadata) with no freeze authority, optional supply lock and metadata lock
- Token checker with market data and mint/freeze authority status
- Trending feed from DexScreener with boosted labels and quick risk checks

### Intelligence
- Watchlist with balances, value, last activity and plain-English activity history
- Live in-tab alerts with browser notifications and alert rules
- Dev tracker: creator discovery, dev holdings and activity, top-holder concentration
- Wallet relationship graph with clickable exploration
- Transaction inspector: plain-English explanations by signature, and simulation of unsigned transactions with drainer detection

### Platform
- Support for Solana version-1 transactions in history tools (fetched directly over JSON-RPC)
- Neon brand: logo, Orbitron typography, hero banner, favicon and social previews
- Footer contact: @0ntrace and team@ontrace.space
- GitHub Pages hosting with custom domain
