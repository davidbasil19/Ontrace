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

## How it works ($0 to launch, no custom program)

Every deal is **one Solana transaction that swaps both sides at once**. It uses only programs already on every Solana network (System, Token, Token-2022, Associated Token, Memo), so there's nothing to deploy and no deploy cost.

- **Instant (private) deals.** The seller names the buyer and signs the exact swap. Any change breaks the signature. The buyer adds their signature and it settles.
- **Request (open) deals.** Anyone can request. The seller confirms a buyer with one signature, which turns it into an instant deal for them. If the seller confirms several buyers, the first to complete wins and the rest fail safely.
- **Durable nonces ("deposits").** A signed deal stays valid for days because it's tied to a small, reusable, refundable nonce account (~0.0015 SOL) owned by the seller. **Cancel** = advance the nonce, which kills every copy of the signed deal. Free deposits can be reclaimed from *My deals*.
- **The site never holds funds or keys.** It stores signed deals (Upstash Redis), checks them against the chain, and shows them. The buyer pays the network fee.

```
app/                 Next.js 16 site + API + Blinks
  lib/deals.ts       swap builder, nonce helpers, signature checks (browser + server)
  lib/dealServer.ts  validation, storage, on-chain status (filled / cancelled / unfunded)
  lib/useDeals.ts    wallet actions: create, request, confirm, take, cancel, reclaim
  app/api/deals/...  deal API
  app/api/actions/   Solana Actions (Blinks)
  scripts/e2e.ts     49-check end-to-end test against a local Solana VM
program/             optional upgrade: an on-chain program that makes open deals instant
```

## Tested

`npm test` runs the real deal engine and server logic against LiteSVM, a local Solana VM. The 49 checks cover:
- instant deals and request → confirm → buy
- tampered terms and fake signatures
- replay protection
- cancel invalidating copies already handed out
- unfunded sellers
- expiry
- Token-2022
- native SOL on both sides
- deposit reuse and reclaim

## Run it

```bash
cd app
cp .env.example .env.local
npm install
npm run dev     # http://localhost:3000 (uses an in-memory store locally)
npm test
```

**On Vercel:**
1. Root Directory `app`.
2. **Storage → Upstash Redis** (free) → connect to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Set `NEXT_PUBLIC_CLUSTER`, `NEXT_PUBLIC_SITE_URL`, and the Helius RPC URLs (`NEXT_PUBLIC_RPC_URL`, `SOLANA_RPC_URL`).

**Domain:**
1. In Vercel → Settings → Domains, add `ontrace.space`.
2. At your registrar, point the A record at the IP Vercel shows.
3. Turn off GitHub Pages.

**Blinks:** register `ontrace.space` in the Dialect registry (dial.to) so deal links unfurl on X.

## Before mainnet (please read)
- Run the devnet test with two real wallets first. Some wallets show an extra notice for pre-signed (durable nonce) transactions.
- **Get a review.** No funds are held, but people sign real trades here. Have someone review `lib/deals.ts` and `lib/dealServer.ts` before you promote it heavily.
- **Use a Helius (free) RPC.** The public RPC is rate-limited.
- Token-2022 tokens with **transfer hooks** aren't supported. Tokens with **transfer fees** deliver slightly less than the listed amount.
- Set `NEXT_PUBLIC_CLUSTER=mainnet-beta`. Priority fees default to 20k micro-lamports per CU.

## Easy next upgrades
- Instant open deals: deploy the slim version of `program/` (needs ~0.5 SOL)
- Trade-from-the-tweet: Jupiter swap Blinks with referral fees
- Telegram / email alerts for new requests
- Token safety scores and counterparty reputation
