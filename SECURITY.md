# Security

OnTrace is a wallet tool, so security is the product. This document explains what OnTrace can and cannot do, how it protects users, and how to report a problem.

## What OnTrace can do

- **Read public blockchain data** — balances, token accounts, mint settings and transaction history — through a Solana RPC endpoint.
- **Read public market data** from DexScreener and quotes from Jupiter.
- **Ask your wallet to sign transactions** you start (reclaim, burn, revoke, unwrap, swap, multi-send, create token). Your wallet displays every transaction for approval.

## What OnTrace cannot do

- It cannot see, store or ask for your **seed phrase or private key**.
- It cannot move funds without your wallet's approval.
- It cannot sign anything in the background.
- It has **no server**: there is no database, no user accounts, no analytics and no tracking.

## Transaction scope

| Action | Instructions used |
|---|---|
| Reclaim SOL | Token Program `CloseAccount` (9) on empty accounts you own |
| Burn junk | Token Program `Burn` (8) + `CloseAccount` (9) on accounts you select |
| Revoke approvals | Token Program `Revoke` (5) on accounts you select |
| Unwrap SOL | Token Program `CloseAccount` (9) on your wSOL account |
| Swap | Transaction built by Jupiter's Swap API for the route you were quoted |
| Multi-send | System `Transfer`, or Associated Token Account `CreateIdempotent` + Token `TransferChecked` |
| Create token | System `CreateAccount`, Token-2022 metadata pointer, `InitializeMint` (no freeze authority), token metadata `Initialize`, ATA create, `MintTo`, optional `SetAuthority` / metadata `UpdateAuthority` |

All transactions add an optional Compute Budget priority fee chosen in Settings.

The `CloseAccount`, `Burn` and `Revoke` encodings were verified byte-for-byte against the official `@solana/spl-token` library.

## Protections built in

- **Confirmation dialogs** before burns, multi-sends and token creation.
- **Risk acknowledgement** required before swapping into tokens rated *High risk* or *Likely scam*.
- **Transaction inspector** flags drainer patterns (token-account ownership hand-over, new approvals, accounts closed to someone else, unknown programs) before you sign.
- **Output escaping**: token names and symbols from third-party APIs are HTML-escaped before display to prevent injected content.
- **Local-only storage**: watchlists, RPC URL and settings stay in the browser's `localStorage`.

## Staying safe

- The only official site is **https://ontrace.space**. Check the address bar.
- Official accounts: **@0ntrace** on X and **team@ontrace.space**.
- OnTrace will **never** ask for your seed phrase, DM you first, or ask you to "validate" or "sync" your wallet.
- Read what your wallet shows before approving anything — on OnTrace or anywhere else.

## Third-party dependencies

| Dependency | Source |
|---|---|
| `@solana/web3.js` 1.98.0 | esm.sh |
| `@solana/spl-token` 0.4.9 | esm.sh |
| `@solana/spl-token-metadata` 0.1.6 | esm.sh |
| `buffer` 6.0.3 | esm.sh |
| Jupiter Swap API | lite-api.jup.ag |
| DexScreener API | api.dexscreener.com |
| Orbitron font | Google Fonts |

Versions are pinned in the import URLs.

## RPC key

The site's RPC key is visible in the page source, like any browser-side key. It is restricted to the `ontrace.space` domain in the provider's dashboard so it can't be used elsewhere.

## Reporting a vulnerability

Please report security issues **privately** to **team@ontrace.space** with:

- A description of the issue and its impact
- Steps to reproduce
- Any transaction signatures or screenshots

Please don't open a public issue for security problems. We aim to acknowledge reports within 72 hours.
