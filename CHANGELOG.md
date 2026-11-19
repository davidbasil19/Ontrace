# Changelog

All notable changes to OnTrace are listed here.

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
