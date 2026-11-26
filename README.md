# OnTrace OTC: Solana OTC deals that travel

A non-custodial, wallet-to-wallet OTC desk for any Solana token. It has everything FlowOTC has, and every deal is also a **Blink**: post the link on X and people can take the deal right inside the post.

> Live at **https://ontrace.space** · X [@0ntrace](https://x.com/0ntrace) · team@ontrace.space
>
> The previous OnTrace toolbox (static site) is kept on the `legacy-toolbox` branch.
> Brand settings live in `app/lib/brand.ts`.

## What's in the box

| Feature | Notes |
|---|---|
| Sell or buy any SPL / Token-2022 token | Pay in SOL, USDC or any other token |
| Pricing as % vs market or fixed price | Locked at signing, with a live "vs market" readout |
| Open or private deals | A private deal can only be taken by the named wallet |
| Expiry from 5m to 7d | The program allows up to 30 days |
| No escrow, atomic settlement | Tokens stay in the maker's wallet until the moment of the swap |
| Markets table | Trending / OTC-active / gainers / losers, 1h-6h-24h (DexScreener) |
| Offers board | Filter by side, sort by best-vs-market or ending soon, live/unfunded detection |
| Top holders, then a private offer | Pitch a deal straight to a whale |
| Recent activity | Parsed from on-chain program events |
| ⌘K search | Token name, mint, wallet or deal address |
| My deals | Private deals sent to you, plus your own deals with cancel |
| **Blinks (the differentiator)** | `actions.json` + Action API; a deal link unfurls as a takeable card on X |
| **Dynamic deal cards** | Auto-generated image per deal (amount, price, discount, expiry) for X previews and Blinks |
| 0% platform fee | Only the network fee |

## Layout

```
program/   Anchor 0.32 program (Rust)
  programs/ontrace_otc/src/lib.rs
app/       Next.js 16 web app + Blink endpoints
  lib/program.ts        hand-written client (used by the browser AND the Blink API)
  app/api/actions/...   Solana Actions (Blinks)
  app/actions.json      maps /deal/* to the Action API
  app/api/og/[offer]    deal card image
  scripts/e2e.ts        end-to-end test against the compiled program
  scripts/devnet-setup.ts  mint test tokens on devnet
```

## How settlement works

1. **create_offer**: stores the terms in an Offer PDA and `approve`s a program-owned delegate PDA for exactly the offered amount. Several offers on the same token stack the allowance.
2. **take_offer_sol / take_offer_token**: in one transaction, the taker pays the maker and the delegate moves the maker's tokens to the taker. If either leg fails (the maker moved their tokens, or the taker is short), everything reverts.
3. **cancel_offer**: closes the offer and shrinks or revokes the allowance.
4. **close_expired**: anyone can clean up an expired offer. Rent goes back to the maker.

Buy offers paid in SOL are wrapped to wSOL automatically and unwrapped for the taker in the same transaction.

## Tested

The program compiles to SBF. `npm test` runs it in LiteSVM using the same client code the site and Blinks use. 33 checks cover:
- tokens stay with the maker
- allowance stacking
- private-deal enforcement and self-trade blocking
- atomic SOL and token settlement
- Token-2022
- SOL wrap and unwrap
- cancel and revoke
- unfunded detection
- expiry, permissionless cleanup and input validation

## Run it (devnet)

### 1. Deploy the program
Install the [Solana CLI](https://solana.com/docs/intro/installation) and Anchor 0.32.x (`avm install 0.32.1 && avm use 0.32.1`).

```bash
cd program
solana config set -u devnet
solana airdrop 5            # or use faucet.solana.com
anchor keys sync            # writes YOUR program id into lib.rs + Anchor.toml
anchor build                # if your toolchain defaults to a newer SBF arch: cargo build-sbf --arch v0
anchor deploy
anchor keys list            # copy the program id
```

### 2. Run the app
```bash
cd app
cp .env.example .env.local   # set NEXT_PUBLIC_PROGRAM_ID to the id from step 1
npm install
npm run dev                  # http://localhost:3000
npm test                     # optional: e2e tests (needs program/target/deploy/ontrace_otc.so)
```

Get test tokens: `npm run devnet:setup -- ~/.config/solana/id.json <your-phantom-address>`. Switch Phantom to devnet, paste a mint into **Create deal**, and use a second wallet as the taker.

### 3. Host it on ontrace.space (Vercel, free)
1. vercel.com → sign in with GitHub → **Add New → Project** → import `davidbasil19/ontrace`.
2. **Root Directory: `app`**. Add env vars from `.env.example` (`NEXT_PUBLIC_CLUSTER`, `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_SITE_URL=https://ontrace.space`). Deploy.
3. Project → **Settings → Domains** → add `ontrace.space` and `www.ontrace.space`.
4. At your domain registrar, replace the old GitHub Pages records with the ones Vercel shows. Usually that's `A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com`. Delete the four `185.199.x.x` A records.
5. GitHub → repo **Settings → Pages** → set Source to **None**. This repo is no longer a static site.

### 4. Make Blinks unfurl on X
1. Test any deal at `https://dial.to/?action=solana-action:https://ontrace.space/api/actions/take/<offer>`. The deal page's **Preview Blink** button does this for you.
2. Register `ontrace.space` in the Dialect Blinks registry (dial.to → register). X only unfurls registered actions. Until it's approved, links still show the deal-card image and open the site.

## Before mainnet (please read)
- **Get an audit.** The program is small and tested, but it moves real money. Have it reviewed before you advertise it.
- **Use a paid RPC** (Helius, Triton, QuickNode). Public mainnet RPC blocks `getProgramAccounts`, which the offers board relies on. Put the key in `SOLANA_RPC_URL`.
- Put the program's **upgrade authority** on a multisig (e.g. Squads), or make it immutable once it's stable.
- Token-2022 tokens with **transfer hooks** aren't supported. Tokens with **transfer fees** deliver slightly less than the listed amount to the taker.
- Set `NEXT_PUBLIC_CLUSTER=mainnet-beta`. Priority fees default to 20k micro-lamports per CU.

## Easy next upgrades
- Partial fills and RFQ / best-bid auctions (extend `Offer` with `remaining`)
- Token safety scores and counterparty reputation on every offer
- Telegram bot and "whale radar" alerts (Helius webhooks on the program)
- An indexer (Helius webhooks into a database) once offer volume outgrows `getProgramAccounts`
- Optional fee in bps to a treasury, if you want platform revenue on top of token fees
