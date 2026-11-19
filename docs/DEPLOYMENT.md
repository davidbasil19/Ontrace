# Deployment

OnTrace is static files, so it can be hosted anywhere that serves HTTPS. Production runs on **GitHub Pages** at **https://ontrace.space**.

## 1. GitHub Pages

1. Open the repository → **Settings → Pages**.
2. **Source:** *Deploy from a branch*. **Branch:** `main`, folder `/ (root)`. Save.
3. The `CNAME` file in the repo sets the custom domain to `ontrace.space`.

Every push to `main` redeploys the site within a minute or two.

## 2. Point the domain at GitHub Pages

At your domain registrar's DNS settings for `ontrace.space`, add:

| Type | Host / Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `davidbasil19.github.io` |

Remove any existing `A` or parking records on `@` that point elsewhere. DNS changes can take from a few minutes to a few hours.

Then in **Settings → Pages**, wait for the DNS check to pass and tick **Enforce HTTPS**.

## 3. RPC key

Solana's public mainnet endpoint blocks browser requests, so mainnet needs a provider key.

1. Create a free key at [helius.dev](https://www.helius.dev).
2. Put the mainnet URL in `DEFAULT_RPC["mainnet-beta"]` in `index.html`.
3. **After the site is live on ontrace.space**, restrict the key in the Helius dashboard to the `ontrace.space` domain (and `www.ontrace.space`). Doing it earlier blocks testing on other URLs.

For public traffic, the intelligence tools (watchlist, alerts, dev tracker, graph) make many requests; upgrade the RPC plan if you hit rate limits.

## 4. Email

`team@ontrace.space` needs a mailbox on the domain (e.g. the registrar's email add-on, or another provider connected via MX records). Until then, mail to it bounces.

## 5. Verify after deploying

- [ ] Site loads at https://ontrace.space with the padlock
- [ ] Logo, favicon and banner show
- [ ] Sharing the link on X shows the banner preview
- [ ] Wallet connects (Phantom / Solflare / Backpack)
- [ ] Wallet scan works on mainnet
- [ ] Trending loads
- [ ] Devnet: create token → multi-send → scan → burn & reclaim
- [ ] Small mainnet swap (≈ $1)

## Other hosts

The same folder works on Netlify, Vercel or Cloudflare Pages. Drop the folder (or connect this repo) and set the custom domain in that host's dashboard. The `CNAME` and `.nojekyll` files are only used by GitHub Pages and are harmless elsewhere.
