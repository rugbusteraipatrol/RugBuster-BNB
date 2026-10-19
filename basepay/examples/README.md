# Reference webhook receivers

The merchant side of a BasePay integration: the endpoint that turns *"a payment
arrived"* into *"this order is fulfilled"*.

Both implementations are functionally identical and are **verified against
BasePay's own signer** — the same code that signs real deliveries — for:

| Case | Expected |
| --- | --- |
| Correctly signed delivery | `200`, handler runs |
| The same delivery retried | `200`, handler does **not** run again |
| Body altered after signing | `400` |
| Wrong secret | `400` |
| Timestamp 10 minutes old, or 10 minutes in the future | `400` |
| Malformed or missing signature header | `400` |

Pick the one that matches your stack:

- **[`webhook-receiver-node/`](webhook-receiver-node/)** — Node, zero dependencies
- **[`webhook-receiver-python/`](webhook-receiver-python/)** — Flask

## Using one

Replace the two handler functions with your own logic:

- `markOrderPaid` / `mark_order_paid` — the session reached `paid`. Fulfil the
  order. `orderRef` is whatever you passed when the session was created, so this
  is normally one `UPDATE` against your own orders table.
- `flagUnderpayment` / `flag_underpayment` — the buyer sent less than the quote.
  **Do not fulfil.** The funds are already in the merchant's wallet and BasePay
  cannot return them; it holds no keys. Refund by hand, part-ship, or contact the
  buyer.

Then set `WEBHOOK_SECRET` to the same value you registered for the merchant, and
point that merchant's `webhookUrl` at this endpoint.

```bash
# Node
WEBHOOK_SECRET=whsec_... PORT=4001 node server.mjs

# Python
pip install -r requirements.txt
WEBHOOK_SECRET=whsec_... gunicorn --bind 0.0.0.0:4001 app:app
```

## Four things worth not getting wrong

These are the mistakes that cost money, and the reason these examples exist
rather than a paragraph of prose.

**1. Verify against the raw bytes.** The signature covers
`${timestamp}.${rawBody}`. If you let your framework parse the JSON and then
re-serialise it to check the signature, key order and whitespace change and it
will never match. This is the most common integration bug by a distance.

**2. Verify before you parse.** Until the signature checks out, the body is
bytes from a stranger — not a payment notification.

**3. Make the idempotency store durable.** Both examples keep processed delivery
ids in memory, which is fine for a demo and wrong in production. Use a table with
a unique index on the delivery id. An in-memory set loses everything on restart
and is not shared across workers, and either one means a retried delivery gets
processed twice. Double-fulfilling an order costs real money.

`event.id` is stable across every retry of the same delivery, so it is the right
key. (BasePay already guarantees at most one delivery per session per event
type; this guards against the retries of that one delivery.)

**4. Answer quickly, work asynchronously.** A slow endpoint is indistinguishable
from a broken one. Acknowledge, then do the real work off the request. Return
`5xx` only when you genuinely failed and want BasePay to retry — it will, with
backoff, up to 6 attempts, then dead-letter.
