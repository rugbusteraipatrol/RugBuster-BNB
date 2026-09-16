# Handoff — continuing BasePay from another session

Read this first, then [`DEPLOY.md`](./DEPLOY.md). Everything below is settled;
do not re-litigate it.

## What this is

`basepay/` is a self-contained Node/TypeScript project in this repository. It is
**non-custodial USDC checkout on Base**: a merchant gives a wallet address, the
buyer pays it directly, and this service watches the chain and reports status.
It holds no key and moves no funds. It shares nothing with the Python collectors
at the repository root.

## State: live on Base mainnet (2026-09-15)

A real $1 payment went end to end: widget quote, payment by scanning the QR code
with MetaMask on a phone, session `paid`, funds in the merchant wallet.

| | |
| --- | --- |
| Service | https://basepay-production.up.railway.app — Railway project `basepay`, service `basepay`, EU West, 1 replica, deploys this branch with Root Directory `/basepay` on every push |
| Database | Neon project `Base`, AWS eu-central-1, branch `production`, direct (unpooled) connection |
| RPC | Alchemy free tier, Base mainnet, WebSocket + HTTP |
| Price feed | CoinGecko with a free demo key |
| Merchants | `rugbuster` and `demo`, both → `0x3208F5DfE9B2010bBe711033f39fF7Ee83039AAf`, no webhooks. `demo` backs the $0.01 checkout at `/demo/` |
| Landing page | `/` — Railway address as the domain, free during beta, contact `fedja@rugbuster.io`, no card-payment claims |

Railway variables set (values live only in Railway): `DATABASE_URL`,
`ADMIN_TOKEN`, `BASE_RPC_HTTP_URL`, `BASE_RPC_WS_URL`, `COINGECKO_API_KEY`,
`PUBLIC_BASE_URL`, `NODE_ENV=production`, `WATCHER_MIN_TICK_INTERVAL_MS=15000`,
`WATCHER_MAX_BLOCK_RANGE=10`.

Railway deploys on push without waiting for CI. To run CI before a risky change
reaches production, push it to another branch first (for example
`claude/basepay-ci-shared-wallet`), then to this one once CI is green.

### What going live taught

- **Alchemy's free tier caps `getLogs` at 10 blocks.** With the default of 500,
  every pass failed from the moment the merchant was registered.
- **`/readyz` said `ready` throughout**, and served the full RPC URL (API key
  included) on a public endpoint. Fixed: URLs in errors and logs are cut to
  their host, and `/readyz` returns `503` when the watcher has stalled.
- **An idle service read as degraded**, because the price only refreshed on
  checkout. `/readyz` now refreshes it.
- **CoinGecko without a key rate-limits Railway's shared IPs** (HTTP 429), which
  left no price and refused every checkout. Fixed with a demo key, plus a 30s
  cool-down so failures are not retried on every request.
- **Merchants sharing a wallet could be issued the same amount**, so a payment
  could settle the wrong session. Migration 002 reserves amounts per address.

## Demo storefront (Webflow)

A one-product Webflow store exists for showing BasePay on a real Webflow site:
https://basepay-demo-store.webflow.io (site id `6aaa6b8a53b07de8aafbd777`,
pages `/`, `/product`, `/thank-you`). Built through the Webflow MCP connector;
terminal/brutalist look, monospace, black and off-white. The product page has a
native Webflow form (email, full name, shipping address) and an Embed element
holding `<div id="checkout" data-amount="25.00" data-currency="USD"
data-product="tee-001"></div>`. The BasePay widget `<script>` tag is not pasted
in yet; that is the next step. The site is on Webflow's free plan, so custom
code (head/footer) is unavailable and the font is a system monospace stack.

## Decisions already made

| | |
| --- | --- |
| Product shape | Embeddable `<script>` widget, not a Webflow Marketplace app. A Marketplace app is wanted later as a second channel, and would *install* this widget — the widget is its prerequisite, not its alternative. |
| Who it is for | Merchants a card processor will not take. BasePay is the product; each merchant runs their own webhook receiver from [`../examples/`](../examples/). |
| Pricing | Free during beta |
| Database | **Neon** free tier, to avoid Railway's Postgres cost until there is traffic |
| App hosting | **Railway** (the user already runs other services there) |
| RPC | **Alchemy**, free tier, Base mainnet |
| CORS | `CORS_ALLOWED_ORIGINS=*` stays. Merchants embed the widget on their own domains, so a single allowed origin would break every other merchant. |

Secrets — the RPC URLs, `DATABASE_URL`, `ADMIN_TOKEN`, API keys, webhook
secrets — go straight into Railway's environment variables. They must not be
pasted into chat or committed.

## Next steps, in order

1. **Rotate the Alchemy API key** and update both `BASE_RPC_*` variables. The
   old key was exposed through `/readyz` before the fix. The user chose to do
   this later, but before the first real customers.
2. **Card on-ramp** for buyers with no crypto: supported in code, off
   (`ONRAMP_PROVIDER=none`). If it is turned on, restore the card copy on the
   landing page.
3. **A custom domain**, then replace the Railway address in `site/`.
4. **Webflow Marketplace app**, as the second channel.

## How the user wants to be worked with

Short answers. One step at a time. They asked explicitly for less text and for
finishing one thing before starting the next. Do not send long plans; send the
next step and wait. They write in Serbian; answer in Serbian.
