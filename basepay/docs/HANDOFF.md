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
| Service | https://basepay-production.up.railway.app — Railway project `basepay`, service `basepay`, EU West, 1 replica, deploys this branch with Root Directory `/basepay` |
| Database | Neon project `Base`, AWS eu-central-1, branch `production`, direct (unpooled) connection |
| RPC | Alchemy free tier, Base mainnet, WebSocket + HTTP |
| Merchant | `rugbuster` → `0x3208F5DfE9B2010bBe711033f39fF7Ee83039AAf`, no webhook yet |

Railway variables set (values live only in Railway): `DATABASE_URL`,
`ADMIN_TOKEN`, `BASE_RPC_HTTP_URL`, `BASE_RPC_WS_URL`, `PUBLIC_BASE_URL`,
`NODE_ENV=production`, `WATCHER_MIN_TICK_INTERVAL_MS=15000`,
`WATCHER_MAX_BLOCK_RANGE=10`.

### What going live taught

- **Alchemy's free tier caps `getLogs` at 10 blocks.** With the default of 500,
  every pass failed from the moment the merchant was registered, and the first
  payment went unnoticed until `WATCHER_MAX_BLOCK_RANGE=10` was set.
- **`/readyz` said `ready` throughout**, and served the full RPC URL (API key
  included) in `watcher.lastError` on a public endpoint. Both are fixed on this
  branch: URLs in errors and logs are cut to their host, and `/readyz` returns
  `503` once the watcher has not completed a pass for a minute.

## Decisions already made

| | |
| --- | --- |
| Product shape | Embeddable `<script>` widget, not a Webflow Marketplace app. A Marketplace app is wanted later as a second channel, and would *install* this widget — the widget is its prerequisite, not its alternative. |
| Who it is for | Merchants a card processor will not take. BasePay is the product; each merchant runs their own webhook receiver from [`../examples/`](../examples/). |
| Database | **Neon** free tier, to avoid Railway's Postgres cost until there is traffic |
| App hosting | **Railway** (the user already runs other services there) |
| RPC | **Alchemy**, free tier, Base mainnet |

Secrets — the RPC URLs, `DATABASE_URL`, `ADMIN_TOKEN`, webhook secrets — go
straight into Railway's environment variables. They must not be pasted into chat
or committed.

## Next steps, in order

1. **Rotate the Alchemy API key** and update both `BASE_RPC_*` variables. The
   old key was exposed through `/readyz` before the fix above.
2. **`CORS_ALLOWED_ORIGINS`** is still `*`. Set it once a real storefront exists.
3. **The three placeholders** in [`../site/`](../site/README.md): domain,
   pricing, contact address.
4. **The demo page** at `/demo/` still says "Nothing here is real money". On
   this deployment it is real money.
5. **Card on-ramp** for buyers with no crypto: supported, off
   (`ONRAMP_PROVIDER=none`).
6. **Webflow Marketplace app**, as the second channel.

## How the user wants to be worked with

Short answers. One step at a time. They asked explicitly for less text and for
finishing one thing before starting the next. Do not send long plans; send the
next step and wait. They write in Serbian; answer in Serbian.
