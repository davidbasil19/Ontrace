# Risk engine

OnTrace rates tokens with `assess(mint, market, mintInfo)` in `index.html`. Each rule can raise the level; the highest level wins and every triggered rule is listed as a reason.

## Levels

| Level | Label | Meaning |
|---|---|---|
| 0 | **No major red flags** | Well-known token, or no automated check found a problem. Not a guarantee of safety. |
| 1 | **Caution** | Something worth knowing, not necessarily bad |
| 2 | **High risk** | Real chance you can't sell or could lose funds |
| 3 | **Likely scam** | Strong scam pattern |

## Inputs

- **Market data** (DexScreener, highest-liquidity pair): price, liquidity (USD), market cap (or FDV), 24h buys + sells, pair creation time.
- **Mint data** (Solana RPC, `jsonParsed`): mint authority, freeze authority, and Token-2022 extensions (`permanentDelegate`, `transferHook`, `transferFeeConfig`).

## Rules

| # | Condition | Level | Reason shown |
|---|---|---|---|
| 1 | Mint is in the `TRUSTED` list | 0 (stops here) | Well-known, established token |
| 2 | No market data | 2 | No trading market found — often a spam airdrop or a dead token |
| 3 | Liquidity < $1,000 | 2 | Liquidity only $X — you may not be able to sell |
| 4 | Market cap > $100K **and** market cap / liquidity > 100 **and** 24h trades < 50 | 3 | Market cap looks fake: huge valuation with almost no trading |
| 5 | 24h trades < 10 | 1 | Almost no trading in the last 24h |
| 6 | Pair created < 24h ago | 1 | Trading pair is less than 24 hours old |
| 7 | Token-2022 permanent delegate | 3 | A permanent delegate can move tokens out of your wallet |
| 8 | Freeze authority set | 2 | Creator can freeze your tokens so you can't sell |
| 9 | Mint authority set | 1 | Creator can still mint more supply |
| 10 | Transfer hook | 1 | Custom transfer hook — transfers run creator code |
| 11 | Transfer fee | 1 | Charges a fee on every transfer |

If nothing triggers: *No major red flags — "No automated check found a problem — still do your own research."*

The top level is deliberately **not** called "Safe": passing automated checks doesn't establish that a token is safe.

## Trusted list

SOL (wSOL), USDC, USDT, PYUSD, JUP, BONK, mSOL, JitoSOL, JupSOL, bSOL. Several of these keep freeze or mint authority for legitimate reasons (e.g. regulated stablecoins), which is why they bypass the rules.

## Wallet health score

`healthScore()` starts at 100 and subtracts:

| Item | Penalty | Cap |
|---|---|---|
| Empty token account | −2 each | −20 |
| *Likely scam* token | −8 each | −40 |
| *High risk* token | −4 each | −20 |
| Active approval | −5 each | −15 |
| Dust (value < $0.50, not risky, not trusted) | −1 each | −10 |

Minimum score is 0. Colours: 80+ green, 50–79 amber, below 50 red.

## Dev tracker signals

| Condition | Level |
|---|---|
| Dev holds > 10% of supply | Warning |
| Dev holds 3–10% | Note |
| Dev sold or moved the token in ≥ 3 of their last 30 transactions | Warning (1–2 times: Note) |
| Top 10 non-pool wallets hold > 50% | Warning |
| Top 10 hold 25–50% | Note |

## Limits

These are heuristics. A token can pass every rule and still be a scam (for example, a coordinated rug by holders), and a legitimate token can trigger warnings (for example, a new launch with low liquidity). Ratings are a starting point for research, not a verdict.
