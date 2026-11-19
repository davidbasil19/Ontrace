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

### Transaction guard
Every transaction OnTrace builds — including swaps returned by Jupiter — passes `guardTransaction()` (in `app.js`) **before the wallet is asked to sign**. It is blocked if:

| Check | Blocked when |
|---|---|
| Fee payer | anyone other than the connected wallet would pay |
| Program allowlist | a top-level instruction calls a program the action doesn't need (base: System, Compute Budget, Token, Token-2022, Associated Token Account; swaps add Jupiter v6) |
| Dangerous instructions | a Token `Approve` / `ApproveChecked` appears, or `SetAuthority` outside token creation |
| Simulation | the transaction would fail on-chain |
| Ownership | any of the user's token accounts would change owner |
| Approvals | any of the user's token accounts would gain a new delegate |
| Token outflow | the user's balance of any token would drop beyond what the action allows (multi-send amount, swap input, or burns/unwrap) |
| Swap output | the user would receive less than the quote's minimum (`otherAmountThreshold`) |
| SOL spend | the user's SOL would drop by more than the expected amount plus a 0.01 SOL fee allowance |

Tested against live mainnet data: a genuine Jupiter swap and a permitted token send pass; redirected swap output, hidden approvals, unknown programs, SOL drains, token drains and ownership hand-overs are blocked.

### No third-party code
- All libraries are bundled in `vendor/solana.bundle.js` and fonts in `fonts/`, served from ontrace.space. See [vendor/README.md](vendor/README.md) to rebuild and verify the bundle's SHA-256.
- **Content Security Policy** (meta tag): `script-src 'self'` — only scripts from ontrace.space run; no inline scripts. `connect-src` allows only Solana RPC providers (Helius, QuickNode, Alchemy, Triton, Ankr, PublicNode, Solana endpoints), Jupiter and DexScreener. `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. Info pages use `script-src 'none'`.
- **Frame protection:** `boot.js` refuses to run the app inside another site's frame (anti-clickjacking).
- **Custom RPC allowlist:** user-supplied RPC URLs must belong to a known provider.

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
| `@solana/web3.js` 1.98.0 | self-hosted bundle |
| `@solana/spl-token` 0.4.9 | self-hosted bundle |
| `@solana/spl-token-metadata` 0.1.6 | self-hosted bundle |
| `buffer` 6.0.3 | self-hosted bundle |
| Orbitron font | self-hosted (`fonts/`) |
| Jupiter Swap API | lite-api.jup.ag (data only) |
| DexScreener API | api.dexscreener.com (data only) |

## RPC key

The site's RPC key is visible in the page source, like any browser-side key. It is restricted to the `ontrace.space` domain in the provider's dashboard so it can't be used elsewhere.

## Recommended account security (maintainers)

- 2FA on GitHub, the domain registrar, Helius, X and the email account
- Registrar lock and DNSSEC enabled on ontrace.space
- Helius key restricted to `ontrace.space` and `www.ontrace.space`

## Audit status

OnTrace **has not yet been independently audited**. The safeguards above were built and tested by the maintainers (including testing the transaction guard against live mainnet data), which is not a substitute for an independent review. Independent reviews will be published here.

## Reporting a vulnerability

Please report security issues **privately** to **team@ontrace.space** with:

- A description of the issue and its impact
- Steps to reproduce
- Any transaction signatures or screenshots

Please don't open a public issue for security problems. We aim to acknowledge reports within 72 hours.
