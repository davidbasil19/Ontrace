# Architecture

OnTrace is a single static page. All logic runs client-side; there is no backend.

```
 Browser (index.html)
 ├── UI: tabs, panels, tables, SVG graph
 ├── Wallet provider (Phantom / Solflare / Backpack) ── signs transactions
 ├── Solana RPC (Helius or custom) ─────────────────── balances, accounts, history, simulation
 ├── Jupiter Swap API ─────────────────────────────── quotes + swap transactions
 └── DexScreener API ──────────────────────────────── prices, liquidity, trending
```

## Code layout inside `index.html`

The `<script type="module">` is organised in sections, top to bottom:

| Section | Responsibility |
|---|---|
| Imports | `buffer`, `@solana/web3.js`, `@solana/spl-token`, `@solana/spl-token-metadata` from esm.sh |
| Constants | `DEFAULT_RPC`, program IDs, `TRUSTED` mints, batch sizes |
| State & helpers | App state, `localStorage` wrapper, formatting (`usd`, `fromBase`, `toBase`), HTML escaping |
| Wallets | Provider detection, connect/disconnect |
| Data | `fetchTokenAccounts`, `fetchMarkets` (DexScreener), `fetchMintInfo`, `loadHoldings` |
| Risk engine | `assess()` and `healthScore()` — see [RISK-ENGINE.md](RISK-ENGINE.md) |
| Transactions | `sendTx`, `sendGroups`, raw instruction builders (`closeIx`, `burnIx`, `revokeIx`) |
| Portfolio & cleanup | Scan, render, reclaim, burn, revoke, unwrap |
| Token pickers | Shared token selects for Swap and Multi-send |
| Swap | Jupiter quote → risk check → swap transaction → sign |
| Multi-send | Parse, validate, batch, send |
| Create token | Token-2022 mint + metadata, supply/metadata locks |
| Token checker | Market + mint authority report |
| Trending | DexScreener profiles/boosts → market data → table |
| Intelligence (shared) | `PROGRAMS` labels, `rpcGetTx`, `getTxs`, `txDeltas`, `classify`, `explainCard` |
| Tx inspector | Signature explanation; `simulateRaw` for unsigned transactions |
| Watchlist & alerts | Local list, refresh, activity, 30-second polling with notifications |
| Dev tracker | `findCreator`, holdings, activity, top holders, signals |
| Wallet graph | Counterparty extraction, radial SVG, table |
| Tabs & settings | Tab routing, RPC and priority-fee settings |

## Key design decisions

**No build step.** One file is easy to audit, host anywhere, and verify against this repository.

**Raw JSON-RPC for history.** Solana mainnet now carries version-1 transactions, which `@solana/web3.js` 1.x rejects. `rpcGetTx()` calls `getTransaction` directly with `maxSupportedTransactionVersion: 1` and reads the JSON, falling back to version 0 when an endpoint doesn't support it.

**Limited concurrency.** `getTxs()` fetches transactions four or five at a time instead of using batch RPC, so it works on free RPC plans that don't support batching.

**Simulation with raw account data.** `simulateRaw()` requests post-simulation account state as base64 and decodes token accounts with `spl.unpackAccount`, comparing them to pre-state from `getMultipleAccountsInfo`. (The `jsonParsed` encoding fails web3.js 1.x response validation for token accounts.)

**Plain-English explanations.** `txDeltas()` turns a parsed transaction into SOL and token balance changes per owner plus flagged instructions. `classify()` turns those changes into a sentence (buy, sell, swap, send, receive, transfer) from the focus wallet's point of view, treating wSOL as SOL.

**Program/pool detection.** Addresses not on the ed25519 curve (`PublicKey.isOnCurve` is false) are PDAs — programs or pools, not people. Used in the graph, holder lists and approvals.

**Batch sizing.** Each action's batch size was chosen by serializing worst-case transactions and keeping them under the 1,232-byte limit with headroom.
