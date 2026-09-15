# Deploying BasePay

Runbook for putting BasePay on Base mainnet, with real money. It assumes
Railway, because that is where the rest of this repository already runs, but
nothing here is Railway-specific beyond the first section — the service is a
plain Docker image that needs Postgres and two URLs.

> **Read the [limitations](../README.md#limitations) before you take a real
> payment.** Most of them cannot be fixed by configuration, and one of them —
> no refunds, ever — is a direct consequence of the non-custodial design.

---

## Before you start

Two values must exist before anything else. Nobody can pick them for you.

### 1. The merchant wallet address

This is where the money lands. It is the one irreversible decision in the whole
system: BasePay never holds a key, so it can never move funds out of a wrong
address, and neither can anyone else.

- Use a **hardware wallet** or a **Safe multisig**, not a browser wallet on a
  laptop.
- It must be an address on **Base mainnet** that you control the keys to.
- Send yourself a test transaction first and confirm it arrives, *before* any
  customer pays into it.

### 2. An RPC endpoint

The watcher reads the chain constantly. The public `https://mainnet.base.org`
works for a demo and will rate-limit you in production.

Get an HTTP URL — and a WebSocket URL if the provider offers one — from a node
provider such as Alchemy or QuickNode. Their free tiers are enough to start,
with the settings in the next section.

BasePay prefers the WebSocket endpoint and falls back to HTTP automatically, so
setting both is strictly better than setting one.

---

### What the RPC will actually cost you

Worth doing before you pick a plan, because the default is not free on every
provider.

The watcher spends **two RPC calls per pass** — one for the chain head, one
`getLogs` — plus one `getBlock` per payment currently inside the re-validation
window. It wakes on every Base block, and Base produces one about every two
seconds, so what decides the bill is `WATCHER_MIN_TICK_INTERVAL_MS`:

| Min tick interval | Passes / month | Calls / month | Payment noticed within |
| --- | --- | --- | --- |
| unthrottled (~2s) | ~1.3M | ~2.6M | ~2s |
| 5s (default) | ~520k | ~1.0M | ~5s |
| 15s | ~173k | ~350k | ~15s |
| 30s | ~87k | ~175k | ~30s |

Add roughly six seconds to that last column for the three confirmations before a
session reaches `paid`. The buyer sees "Waiting for payment" throughout, so a
slower interval costs very little in practice.

Treat the call counts as estimates: providers meter by weighted units, not raw
calls, and `getLogs` weighs more than a head lookup. Check them against your
provider's free allowance — 15s fits comfortably inside the usual ones; the
default does not fit the smallest.

Ticking less often never loses a payment. Each pass scans the entire range from
the stored bookmark to the current head, so a longer interval batches the work
rather than skipping any of it.

### Free tiers also cap the `getLogs` range

Alchemy's free plan answers `eth_getLogs` over **at most 10 blocks** and rejects
every wider request. The watcher asks for 500 by default, so on that plan set
`WATCHER_MAX_BLOCK_RANGE=10`, or it will not settle a single payment.

The failure is easy to miss. The watcher only calls `getLogs` once a merchant
exists, so a fresh deployment passes every check until the merchant is
registered, and then every pass fails.

Ten blocks costs nothing extra in normal running: at a 15s interval a pass covers
about eight blocks, so it is still one `getLogs` per pass. Only a backfill after
downtime takes more calls.

## 1. Create the Railway services

In a Railway project:

1. **Add a Postgres database.** Railway provisions it and exposes
   `DATABASE_URL`.
2. **Add a service from this repository.**
3. In that service's settings, set the **Root Directory** to `basepay`.
   This is the step people miss. Without it Railway looks at the repository
   root, finds the Python project, and builds the wrong thing.

Railway then picks up `basepay/Dockerfile` and `basepay/railway.json`
automatically. The image is built exactly as CI builds it.

*(Railway's UI wording changes from time to time; the setting is per-service and
is called the root or base directory.)*

## 2. Set the variables

Minimum for a working production deployment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference the Postgres service. On Neon, use the direct (unpooled) connection string |
| `ADMIN_TOKEN` | `openssl rand -hex 32` |
| `BASE_RPC_HTTP_URL` | your provider's HTTPS URL |
| `BASE_RPC_WS_URL` | your provider's WSS URL (recommended) |
| `WATCHER_MIN_TICK_INTERVAL_MS` | `15000` on a free RPC tier (see above) |
| `WATCHER_MAX_BLOCK_RANGE` | `10` on Alchemy's free tier (see above) |
| `COINGECKO_API_KEY` | a free CoinGecko demo key. Without one, CoinGecko rate-limits Railway's shared IPs and new checkouts are refused for want of a price |
| `CORS_ALLOWED_ORIGINS` | your storefront's origin, e.g. `https://shop.example.com` |
| `PUBLIC_BASE_URL` | the URL Railway gives this service |

Everything else has a correct default for Base mainnet — `CHAIN_ID=8453`,
USDC's address, 3 confirmations, 15-minute sessions. Leave them alone unless you
have a reason. Every variable is documented in
[`.env.example`](../.env.example).

`PORT` is injected by Railway; do not set it.

**Do not set `WATCHER_START_BLOCK`.** On a fresh deployment the watcher starts at
the current chain head, which is correct — there are no older sessions to settle.
Set it only when you are deliberately re-scanning history.

There is no separate migration step. The service runs its migrations on boot, so
a brand-new database is ready the moment the container starts.

## 3. Check it came up

```bash
curl -s https://your-service.up.railway.app/healthz
curl -s https://your-service.up.railway.app/readyz | jq
```

`/readyz` is the one that matters. It returns `503` and names the failing check
when something is wrong:

```json
{
  "status": "ready",
  "checks": {
    "database": { "ok": true },
    "price":    { "ok": true, "priceUsd": "0.99980000", "ageSeconds": 12 },
    "watcher":  { "enabled": true, "transport": "websocket+http",
                  "lastProcessedBlock": "24310022", "headBlock": "24310022",
                  "lastTickAt": "2026-09-15T11:54:39.332Z", "lastError": null,
                  "ok": true }
  }
}
```

`watcher.ok` turns false, and `/readyz` returns `503`, when no pass has
completed for three safety intervals: a minute at the default poll interval.
`lastError` says why. Your RPC is almost always the cause. A long backfill after
downtime can also hold it at `503` until the watcher catches up. Any URL in
`lastError` is cut to its host, because this endpoint is public and RPC URLs
carry the API key.

If `price.ok` is false, new sessions will be refused rather than quoted wrongly.
That is deliberate. `/readyz` asks for a fresh price whenever the cached one is
past `PRICE_CACHE_TTL_SECONDS`. An idle service therefore does not read as stale;
`price.ok` is false only when CoinGecko is actually unreachable.

## 4. Register the merchant

```bash
curl -X POST https://your-service.up.railway.app/admin/merchants \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
        "merchantId": "acme",
        "walletAddress": "0xYourBaseMainnetAddress",
        "webhookUrl": "https://your-store.example.com/hooks/basepay",
        "webhookSecret": "'"$(openssl rand -hex 32)"'"
      }'
```

Save that `webhookSecret` — it is never returned again, by design. Your receiver
needs the same value.

The address is validated and stored checksummed. A mixed-case address that fails
its EIP-55 checksum is rejected outright, because for a payout address a typo is
money sent into the void.

## 5. Stand up the webhook receiver

This is the piece that actually completes an order. Until it exists, payments
are recorded and reported but nothing in your store changes.

Working, tested implementations are in
[`examples/`](../examples/) — Node and Python, both verified against BasePay's
real signer. Copy one, replace the two handler functions, deploy it, and point
the merchant's `webhookUrl` at it.

## 6. Embed the widget

```html
<div id="basepay"></div>
<script
  src="https://your-service.up.railway.app/widget/widget.js"
  data-merchant="acme"
  data-amount-usd="45.00"
  data-order-ref="ORDER-1001"
  data-target="#basepay"
></script>
```

See [the README](../README.md#embedding-in-webflow) for every attribute and for
the dynamic-price variant.

---

## Go-live checklist

Do these in order. Do not skip the small payment.

- [ ] `/readyz` returns `200` with all checks green
- [ ] Merchant registered; wallet address verified as one you control
- [ ] Webhook receiver deployed and reachable over HTTPS
- [ ] `CORS_ALLOWED_ORIGINS` set to your real storefront origin, not `*`
- [ ] `ADMIN_TOKEN` is a generated secret, stored somewhere safe
- [ ] **Send one real payment of about $1** end to end: widget quotes it, you pay
      from a wallet, the session reaches `paid`, your receiver marks the order,
      and the funds are in the merchant wallet
- [ ] `GET /admin/webhooks/dead-letters` is empty afterwards

Only after that last item is worth pointing customers at it.

---

## Day-to-day operations

**A buyer says they paid but the session is still pending.**
`GET /admin/payments/unmatched`. If their transfer is listed, the amount did not
match any open session — usually a hand-typed amount, or a fiat on-ramp that
delivered outside the tolerance. The money is in the merchant's wallet; settle
that order by hand.

**A merchant says they never got a webhook.**
`GET /admin/sessions/:id/webhooks` shows every attempt with its status code and
error. `GET /admin/webhooks/dead-letters` lists deliveries that gave up after 6
attempts. The session record is the source of truth either way —
`GET /api/sessions/:id` always works.

**Logs worth alerting on.**
A transfer that could not be attributed logs at `warn`. A reorg touching an
already-settled session logs at `error` with the session id — that one needs a
person.

**Scaling.** Several instances can serve the API safely; reservations and
webhook claims are enforced by the database. The watcher is written for **one
instance per chain** — running two will not corrupt anything, because recording
a transfer is idempotent, but they will duplicate RPC work. Keep `numReplicas`
at 1 unless you split the watcher out.

**Backups.** Turn on Railway's Postgres backups. The chain is the ultimate
record of what was paid, but `sessions` is the only record of what each payment
*was for*.
