# BasePay

Non-custodial USDC checkout for merchants who cannot get a traditional payment
processor. The merchant provides a wallet address; buyers pay into it directly;
BasePay watches the chain and tells the merchant when a payment arrived.

**BasePay never holds a private key and never moves funds.** It reads chain state
and reports status. That is the whole security model: if this service is
compromised, an attacker can lie about payment status, but they cannot take money.

- **Chain:** Base mainnet (8453)
- **Asset:** USDC only — `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals
- **Embed:** one `<script>` tag in a Webflow page

---

## Contents

- [How it fits together](#how-it-fits-together)
- [The attribution problem, and how amounts solve it](#the-attribution-problem-and-how-amounts-solve-it)
- [Payment lifecycle](#payment-lifecycle)
- [Local setup](#local-setup)
- [End-to-end demo](#end-to-end-demo)
- [Embedding in Webflow](#embedding-in-webflow)
- [API](#api)
- [Webhooks](#webhooks)
- [Configuration](#configuration)
- [Tests](#tests)
- [Operating it](#operating-it)
- [Limitations](#limitations)

---

## How it fits together

```mermaid
flowchart TB
    subgraph browser["Buyer's browser (merchant's Webflow page)"]
        widget["BasePay widget<br/>vanilla TS, shadow DOM, one file"]
        wallet["Browser wallet<br/>(EIP-1193)"]
    end

    subgraph service["BasePay service (Node + TypeScript)"]
        api["api<br/>POST /api/sessions<br/>GET /api/sessions/:id"]
        sessions["sessions<br/>quote, amount reservation,<br/>state machine"]
        price["price<br/>CoinGecko, 60s cache,<br/>staleness policy"]
        watcher["watcher<br/>USDC Transfer logs,<br/>confirmations, reorgs"]
        webhooks["webhooks<br/>HMAC-signed, retried,<br/>dead-lettered"]
    end

    db[("Postgres<br/>merchants · sessions · payments<br/>webhook_deliveries · watcher_state")]
    chain["Base mainnet<br/>USDC contract"]
    coingecko["CoinGecko"]
    merchant["Merchant's backend"]
    merchantWallet["Merchant's wallet"]
    onramp["Fiat on-ramp<br/>(Transak / MoonPay)"]

    widget -->|"create session, then poll"| api
    api --> sessions
    sessions --> price
    price --> coingecko
    sessions --> db
    watcher --> db
    webhooks --> db

    widget -->|"transfer(merchant, exact amount)"| wallet
    wallet -->|"USDC"| merchantWallet
    widget -.->|"no crypto? prefilled link"| onramp
    onramp -->|"USDC"| merchantWallet

    watcher -->|"getLogs / getBlock"| chain
    merchantWallet -.->|"Transfer event"| chain
    webhooks -->|"POST, signed"| merchant

    classDef money stroke-width:3px
    class merchantWallet,chain money
```

Funds travel along one path only: buyer wallet → merchant wallet. BasePay is not
on it.

### Module layout

| Path | Responsibility |
| --- | --- |
| `server/src/api` | HTTP surface: session routes, admin routes, health, middleware |
| `server/src/sessions` | Quoting, amount-offset allocation, the state machine, transfer→session matching |
| `server/src/price` | CoinGecko client and the cache/staleness policy |
| `server/src/watcher` | Chain client, the scan loop, settlement transitions |
| `server/src/webhooks` | Signing, delivery, retry and dead-lettering |
| `server/src/db` | Pool, migrations, one repository module per table |
| `widget/src` | The embeddable widget (no framework, no runtime deps in the bundle) |

---

## The attribution problem, and how amounts solve it

A merchant has **one static address**. Two buyers checking out for `$45.00` at the
same moment would send two identical transfers to it. Nothing in either
transaction says which order it belongs to — same recipient, same amount, and the
sender address is whatever wallet the buyer happened to use.

Per-buyer deposit addresses would solve this, but generating them means holding
keys, which would make BasePay custodial.

So BasePay makes every open quote a **distinct amount**. At session creation it
converts USD to USDC and then adds a small offset in micro-units:

```
base amount   = round(amountUsd / usdcPriceUsd)      e.g. 45.000000 USDC
offset        = smallest n in [0, AMOUNT_OFFSET_MAX) not already held
quoted amount = base + offset                        e.g. 45.000002 USDC
```

`(to, value)` is then a unique key, and the watcher can attribute a transfer with
no ambiguity at all.

**The reservation is a database constraint, not application logic:**

```sql
CREATE UNIQUE INDEX sessions_open_amount_uniq
    ON sessions (merchant_id, amount_usdc)
    WHERE status IN ('pending', 'confirming');
```

An open session holds its amount. Settling or expiring moves the row out of the
partial index, which releases the slot. Two concurrent requests that pick the same
offset cannot both win: Postgres rejects one, and the loser retries from a random
point in the window.

### Collision ceiling

`AMOUNT_OFFSET_MAX` (default **1000**) is the size of the window, and therefore:

- the cap on one merchant's **concurrent open sessions at the same price** — 1000
  simultaneous `$45.00` checkouts;
- the **worst-case overpay**: `0.000999` USDC, about a tenth of a cent.

Different prices have different windows, so a merchant can have far more than 1000
open sessions in total. The ceiling only binds per price point.

**When the window is exhausted, the session is refused** with HTTP 409 and
`AMOUNT_SLOTS_EXHAUSTED`, and the widget tells the buyer to try again shortly. An
offset is never silently reused: a reused amount produces a payment that cannot be
attributed to either session, which is strictly worse than a checkout that failed
cleanly. `SESSION_RATE_LIMIT_PER_MINUTE` exists so one caller cannot exhaust a
merchant's window and deny checkout to real buyers.

### Near-miss amounts

Exact matching is the primary path and the only one a wallet payment uses. Fiat
on-ramps cannot deliver an exact amount — they take fees and round to their own
precision — so the matcher has two bounded tolerance paths:

| Case | Condition | Result |
| --- | --- | --- |
| Exact | `value == quote` | Session settles |
| Underpaid | `quote * UNDERPAY_MIN_RATIO <= value < quote` | Session marked `underpaid` |
| Overpaid | `quote < value <= quote * OVERPAY_MAX_RATIO` | Session settles; the excess is recorded |
| Ambiguous | more than one open session fits | Recorded `unmatched`, no session touched |
| Unrelated | nothing fits | Recorded `unmatched` |

Tolerance only ever applies when **exactly one** open session could be meant, and
only to sessions still in `pending`. Ambiguity is never guessed. Unattributed
money is visible at `GET /admin/payments/unmatched` rather than quietly dropped.

---

## Payment lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: POST /api/sessions<br/>amount quoted and reserved

    pending --> confirming: exact transfer seen<br/>(1 confirmation)
    pending --> underpaid: transfer below the quote
    pending --> expired: 15 minutes elapsed

    confirming --> paid: CONFIRMATIONS_REQUIRED reached
    confirming --> pending: reorg — the transfer<br/>left the canonical chain

    paid --> [*]
    underpaid --> [*]
    expired --> [*]

    note right of confirming
        A confirming session never expires.
        Money is already in flight, so it
        must reach a terminal state.
    end note

    note right of paid
        payment.paid webhook fires here,
        exactly once per session.
    end note
```

1. **Quote.** The widget POSTs `{merchantId, amountUsd, orderRef}`. The service
   fetches the USDC price (cached 60s), converts, reserves a unique amount, and
   returns the address, the exact amount, an EIP-681 payment URI for the QR code,
   and an expiry 15 minutes out.
2. **Pay.** The buyer either signs a `transfer` in their wallet for exactly the
   quoted amount, or follows a prefilled on-ramp link that delivers USDC to the
   merchant address. Either way the widget just polls; it does not decide anything.
3. **Observe.** The watcher scans USDC `Transfer` logs into merchant addresses. On
   a match the session moves to `confirming` at 1 confirmation.
4. **Confirm.** At `CONFIRMATIONS_REQUIRED` (default 3) the session becomes `paid`,
   and a signed `payment.paid` webhook is queued.
5. **Reorg safety.** Every tick re-scans the last `REORG_DEPTH_BLOCKS` blocks and
   re-checks the block hash of every transfer recorded there. If a transfer is no
   longer canonical it is orphaned and its session goes back to `pending`.
   Re-recording a transfer is idempotent on `(tx_hash, log_index)`, so a re-included
   transaction simply re-settles.
6. **Restart safety.** `watcher_state` holds the last processed block. On boot the
   watcher backfills from there. Downtime delays settlement; it does not lose
   payments.

---

## Local setup

Requirements: Docker, and Node 22 if you want to run the tooling outside the
container.

```bash
cd basepay
docker compose up --build
```

That starts Postgres, an anvil dev chain (2s blocks, so confirmations accrue the
way they do on Base), a CoinGecko stub reporting parity, a webhook sink that
verifies signatures, and the service itself on `http://localhost:8080`. Migrations
run on boot, and `config/merchants.json` is seeded.

Deploy the stand-in USDC to the dev chain:

```bash
npm install
npm run dev:chain --workspace server
```

It deploys at `0x5FbDB2315678afecb367f032d93F642f64180aa3` — anvil account 0's
first deployment, which is what `docker-compose.yml` already points
`USDC_ADDRESS` at — and mints 1,000,000 USDC to the buyer account.

Check the service is healthy:

```bash
curl -s localhost:8080/readyz | jq
```

### Running it without Docker

```bash
createdb basepay
cp .env.example .env          # set DATABASE_URL at minimum
npm install
npm run migrate --workspace server
npm run build --workspace widget
npm run dev --workspace server
```

---

## End-to-end demo

With the stack up, open **<http://localhost:8080/demo/>**. It is a mock storefront
with the real widget embedded.

1. Click **Checkout**. The widget shows `Pay $45.00`, the exact USDC amount, the
   merchant address, a QR code and a countdown.
2. Copy the exact amount from the widget and send it from the dev chain:

   ```bash
   npm run dev:pay --workspace server -- 45.000000 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
   ```

   (Use the amount the widget quotes, to the last digit — that is what identifies
   the session.)
3. Watch the widget go **Waiting for payment → Payment received, confirming
   (1 of 3) → Payment received**.
4. Watch the signed webhook arrive:

   ```bash
   docker compose logs -f webhooksink
   ```

   ```
   [webhook-sink] verified payment.paid
   { "type": "payment.paid", "data": { "orderRef": "DEMO-1001", "status": "paid", ... } }
   ```

The same flow runs unattended in `server/test/integration/watcher.anvil.test.ts`.

---

## Embedding in Webflow

Add an **Embed** element (or paste into Page Settings → Custom Code) where the
checkout should appear:

```html
<div id="basepay"></div>
<script
  src="https://pay.example.com/widget/widget.js"
  data-merchant="acme"
  data-amount-usd="45.00"
  data-order-ref="ORDER-1001"
  data-target="#basepay"
></script>
```

| Attribute | Required | Meaning |
| --- | --- | --- |
| `data-merchant` | yes | Merchant id registered with the service |
| `data-amount-usd` | yes | Price in USD, at most 2 decimals |
| `data-target` | no | CSS selector to mount into; without it the widget mounts where the script tag sits |
| `data-order-ref` | no | Your order id; echoed back in the webhook |
| `data-api` | no | API origin; defaults to wherever the script was served from |
| `data-auto` | no | `false` to mount manually via `window.BasePay.mount({...})` |
| `data-explorer` | no | Block explorer root for transaction links |
| `data-poll-ms` | no | Status poll interval; default 4000, minimum 1000 |

For a dynamic price (a CMS field, a cart total), skip auto-mount:

```html
<script src="https://pay.example.com/widget/widget.js" data-auto="false"></script>
<script>
  const widget = window.BasePay.mount({
    merchantId: 'acme',
    amountUsd: cartTotal,
    orderRef: orderId,
    target: '#basepay',
  });

  document.querySelector('#basepay').addEventListener('basepay:settled', (event) => {
    if (event.detail.status === 'paid') showThankYou();
  });
</script>
```

**Surviving an arbitrary Webflow page.** The widget renders inside a shadow root,
so the host page's CSS cannot reach in and the widget's styles cannot leak out. It
is responsive down to 320px, keyboard navigable with visible focus rings, announces
status changes through an `aria-live` region, and honours
`prefers-reduced-motion` and `prefers-color-scheme`. The bundle is one file with no
runtime dependencies.

**Set `CORS_ALLOWED_ORIGINS` to your Webflow domain** in production. Nothing in
the API is authenticated by a cookie, so CORS is not load-bearing for security,
but there is no reason to leave it open.

---

## API

### `POST /api/sessions`

```json
{ "merchantId": "acme", "amountUsd": "45.00", "orderRef": "ORDER-1001" }
```

`201 Created`:

```json
{
  "sessionId": "0d9a2c1e-...",
  "status": "pending",
  "amountUsd": "45.00",
  "amountUsdc": "45.000002",
  "amountUsdcMicro": "45000002",
  "payToAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "chainId": 8453,
  "token": { "address": "0x8335...2913", "symbol": "USDC", "decimals": 6 },
  "paymentUri": "ethereum:0x8335...2913@8453/transfer?address=0x3C44...93BC&uint256=45000002",
  "priceUsd": "1.00000000",
  "priceStale": false,
  "confirmations": 0,
  "confirmationsRequired": 3,
  "expiresAt": "2026-09-12T12:45:00.000Z",
  "transactions": [],
  "onramp": null
}
```

### `GET /api/sessions/:id`

Same shape, with live `status`, `confirmations`, `receivedUsdc` and
`transactions`. `status` is one of `pending`, `confirming`, `paid`, `underpaid`,
`expired`.

### Errors

Every error is `{ "error": { "code": "...", "message": "..." } }`. Branch on `code`.

| Code | Status | Meaning |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | Malformed body |
| `INVALID_AMOUNT` | 409 | Not a positive amount at cent precision |
| `MERCHANT_NOT_FOUND` | 404 | Unknown merchant id |
| `SESSION_NOT_FOUND` | 404 | Unknown session id |
| `AMOUNT_SLOTS_EXHAUSTED` | 409 | No unique amount available right now |
| `RATE_LIMITED` | 429 | Too many sessions from this caller |
| `PRICE_UNAVAILABLE` | 503 | Price feed too stale to quote safely |

### Admin (bearer token, `ADMIN_TOKEN`)

| Endpoint | Purpose |
| --- | --- |
| `GET /admin/merchants` | List merchants (secrets are never returned) |
| `POST /admin/merchants` | Create or update a merchant |
| `GET /admin/payments/unmatched` | Transfers that could not be attributed |
| `GET /admin/webhooks/dead-letters` | Deliveries that gave up |
| `GET /admin/sessions/:id/webhooks` | Delivery history for one session |

```bash
curl -X POST localhost:8080/admin/merchants \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
        "merchantId": "acme",
        "walletAddress": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        "webhookUrl": "https://acme.example/hooks/basepay",
        "webhookSecret": "'"$(openssl rand -hex 32)"'"
      }'
```

Merchants can also be seeded from a file — see `config/merchants.json`. A
`webhookSecret` of `"env:NAME"` is read from the environment, so a seed file can
be committed without secrets in it.

### Health

- `GET /healthz` — liveness; touches nothing.
- `GET /readyz` — database, price age and watcher progress. `503` when degraded.

---

## Webhooks

`payment.paid` and `payment.underpaid` are POSTed to the merchant's URL.

```
POST /hooks/basepay
content-type: application/json
x-basepay-event: payment.paid
x-basepay-delivery: 0d9a2c1e-...
x-basepay-timestamp: 1789216000
x-basepay-signature: sha256=9f86d081...
```

```json
{
  "id": "0d9a2c1e-...",
  "type": "payment.paid",
  "createdAt": "2026-09-12T12:31:04.000Z",
  "data": {
    "sessionId": "0d9a2c1e-...",
    "merchantId": "acme",
    "orderRef": "ORDER-1001",
    "status": "paid",
    "amountUsd": "45.00",
    "amountUsdc": "45.000002",
    "receivedUsdc": "45.000002",
    "payToAddress": "0x3C44...93BC",
    "chainId": 8453,
    "token": { "address": "0x8335...2913", "symbol": "USDC", "decimals": 6 },
    "transactions": [
      { "txHash": "0x...", "logIndex": 12, "blockNumber": "24310022", "amountUsdc": "45.000002", "from": "0x..." }
    ]
  }
}
```

### Verifying a delivery

The signature is `HMAC-SHA256(secret, "{timestamp}.{rawBody}")`. Verify against the
**raw request bytes** — re-serialising the parsed JSON changes key order and
whitespace and will not match.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, headers, secret) {
  const timestamp = Number(headers['x-basepay-timestamp']);
  if (!Number.isInteger(timestamp)) return false;
  // Bound the replay window in both directions.
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const actual = Buffer.from(String(headers['x-basepay-signature']).replace(/^sha256=/, ''), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```

`scripts/webhook-sink.mjs` is a working receiver you can read or run.

### Delivery guarantees

- **At most one delivery per (session, event)**, enforced by a unique index, so a
  reorg replay or a restart mid-settle cannot double-notify.
- **Retried** up to `WEBHOOK_MAX_ATTEMPTS` (default 6) with exponential backoff
  (`5s, 10s, 20s, 40s, 80s, 160s`, plus jitter), then **dead-lettered** and
  visible at `GET /admin/webhooks/dead-letters`.
- Any non-2xx response, timeout or connection error counts as a failed attempt.
- **Respond quickly and do your work asynchronously**; a slow endpoint is
  indistinguishable from a broken one.

---

## Configuration

Every variable is documented in [`.env.example`](./.env.example). The ones worth
deciding deliberately:

| Variable | Default | Why you would change it |
| --- | --- | --- |
| `CONFIRMATIONS_REQUIRED` | `3` | Higher is safer against reorgs, slower to settle |
| `REORG_DEPTH_BLOCKS` | `12` | Re-validation window; keep it well above the above |
| `AMOUNT_OFFSET_MAX` | `1000` | Concurrent checkouts per price vs. worst-case overpay |
| `SESSION_TTL_SECONDS` | `900` | Longer quotes carry more price risk |
| `PRICE_MAX_STALE_SECONDS` | `600` | How long a price feed outage may last before checkout stops |
| `BASE_RPC_HTTP_URL` | public endpoint | Use a dedicated provider in production |
| `CORS_ALLOWED_ORIGINS` | `*` | Set it to your Webflow domain |

---

## Tests

```bash
npm test                                    # server suite
npm run test --workspace widget             # widget suite
npm run lint && npm run typecheck && npm run build
```

Unit tests need nothing. Integration tests need Postgres:

```bash
export TEST_DATABASE_URL=postgres://basepay:basepay@localhost:5432/basepay_test
npm run test --workspace server
```

The chain-backed suite additionally needs `anvil` on PATH ([Foundry](https://getfoundry.sh)).
Suites skip rather than fail when their dependency is missing, so check the run
summary if you expect them to have run. CI installs both.

| Suite | Covers |
| --- | --- |
| `test/unit/amounts` | Integer money math, offset allocation, window exhaustion |
| `test/unit/stateMachine` | Every legal and illegal transition |
| `test/unit/matching` | Exact, underpaid, overpaid, ambiguous, out-of-tolerance |
| `test/unit/priceService` | Cache, staleness flag, refusal past the ceiling |
| `test/unit/signature` | Signing, tampering, replay, malformed headers |
| `test/integration/sessions` | Reservation under real concurrency, expiry, release |
| `test/integration/settlement` | Full state machine incl. reorg revert and re-inclusion |
| `test/integration/watcher` | Backfill, chunked scans, reorg handling, bookmark |
| `test/integration/watcher.anvil` | The whole flow against a real chain and a real token |
| `test/integration/webhooks` | Signed delivery, retry, recovery, dead-letter |
| `test/integration/api` | HTTP contract, error codes, admin auth |

`BASE_FORK_RPC_URL` makes the anvil suite fork Base mainnet and run against the
real USDC contract instead of the checked-in stand-in token
(`server/test/fixtures/MockUSDC.sol`, compiled by `scripts/compile-mock-usdc.mjs`
and committed so the suite needs no Solidity toolchain).

---

## Operating it

**A buyer says they paid and the session is still pending.**
Check `GET /admin/payments/unmatched`. If their transfer is there, the amount did
not match any open session — usually a hand-typed amount, or an on-ramp that
delivered outside the tolerance. The funds are in the merchant's wallet; settle
the order manually.

**`readyz` reports degraded.**
It names the failing check. A stale `price` means CoinGecko is unreachable —
existing sessions still settle, new ones are refused once past
`PRICE_MAX_STALE_SECONDS`. A `watcher` with a stale `lastTickAt` or a `lastError`
means the RPC is failing; settlement resumes from the bookmark once it recovers.

**A merchant says they never got a webhook.**
`GET /admin/sessions/:id/webhooks` shows every attempt with its status code and
error. Dead letters are listed at `GET /admin/webhooks/dead-letters`. The session
record is the source of truth either way — `GET /api/sessions/:id` always works.

**Logs.** A payment that cannot be attributed logs at `warn`; a reorg affecting an
already-settled session logs at `error` with the session id — that one needs a
human.

---

## Limitations

Stated plainly, because this handles money.

- **No refunds, ever.** An underpayment is recorded and reported; the funds are
  already in the merchant's wallet and BasePay has no key that could send them
  back. The merchant resolves it out of band. This is a consequence of being
  non-custodial, not an omission.
- **A second partial payment does not top up the first.** The first short transfer
  marks the session `underpaid`, which is terminal. A follow-up transfer is
  recorded as `unmatched`. Reconcile manually.
- **Late payments are not matched.** A transfer arriving after a session expired is
  recorded as `unmatched`, not applied to the expired session. Expired quotes have
  released their amount and may have been reissued, so applying them could credit
  the wrong order.
- **Reorgs deeper than `CONFIRMATIONS_REQUIRED` are not reversed.** If a settled
  payment is orphaned, BasePay logs at `error` and flags the payment row, but does
  not un-pay the session or retract the webhook — the merchant may already have
  shipped. Raise `CONFIRMATIONS_REQUIRED` if your risk tolerance is lower.
- **The on-ramp path is best-effort.** Transak and MoonPay cannot deliver an exact
  amount, so those payments settle through the bounded tolerance path, or land as
  `unmatched` if they fall outside it or another session is equally plausible. The
  on-ramp's own delivery time (minutes to hours) can also exceed the session TTL.
  MoonPay URL signing is not implemented.
- **The amount window is a real ceiling.** A merchant cannot have more than
  `AMOUNT_OFFSET_MAX` open sessions at one price; past that, checkout is refused
  until sessions settle or expire. Raise it, or shorten `SESSION_TTL_SECONDS`.
- **Price risk lives with the merchant.** A quote is fixed for 15 minutes. If USDC
  depegs inside that window, the merchant receives the quoted USDC, not the quoted
  dollars.
- **Single-writer assumptions.** Several instances can serve the API safely
  (reservations and webhook claims are database-enforced), but the watcher is
  written for one instance per chain. Running two will not corrupt anything —
  recording transfers is idempotent — but they will duplicate RPC work.
- **No merchant dashboard, no accounts, no multi-chain, no subscriptions.**
  Deliberately out of scope.
- **The service can lie, but it cannot steal.** A compromised BasePay could report
  a payment that never happened. Merchants shipping high-value goods should verify
  against the chain using the `txHash` in the webhook.

---

## License

MIT. See [LICENSE](../LICENSE).
