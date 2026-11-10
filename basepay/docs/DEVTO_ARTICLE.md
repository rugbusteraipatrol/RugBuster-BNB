---
title: Matching USDC payments to orders without a wallet per order
published: false
description: How StableCart takes USDC on Base into one static merchant address and still knows which order each payment belongs to.
tags: webdev, woocommerce, web3, postgres
cover_image: https://www.stablecart.org/og.png
---

I built [StableCart](https://www.stablecart.org), a checkout that takes USDC on Base straight into a merchant's own wallet. No processor holds the money, and there is no account: the merchant pastes one wallet address into a WooCommerce plugin and saves.

That constraint — one static address per merchant, and we never touch the funds — makes the core problem more interesting than it looks. When 25 USDC lands in a shop's wallet, which order paid it?

## The usual answer: an address per order

Most crypto gateways generate a fresh deposit address for every checkout. The address *is* the order ID. It works, but it means the gateway derives and controls those addresses, and then sweeps the money to the merchant. That is custody, and custody is exactly what I wanted to avoid.

## The answer here: a unique amount per order

Every open checkout for a given address is quoted a distinct amount, down to the micro-USDC (USDC has 6 decimals). A $25.00 order might be quoted `25.000173 USDC`. The watcher then identifies a payment by the pair `(to, value)`.

The offset search is small and deliberately boring:

```ts
export function allocateOffset(
  baseAmount: bigint,
  takenAmounts: ReadonlySet<bigint>,
  offsetMax: number,
  startAt = 0,
): number {
  const start = ((Math.trunc(startAt) % offsetMax) + offsetMax) % offsetMax;
  for (let probe = 0; probe < offsetMax; probe += 1) {
    const offset = (start + probe) % offsetMax;
    if (!takenAmounts.has(baseAmount + BigInt(offset))) return offset;
  }
  throw new OffsetExhaustedError(offsetMax);
}
```

With the default window of 1,000 slots, the buyer overpays by at most 0.000999 USDC — a tenth of a cent — and a single address can have up to 1,000 checkouts open at the same price.

If every slot is taken, the checkout is refused. Reusing an amount would make two orders indistinguishable, and the only way to "resolve" that later is to guess. Guessing with other people's money is not a feature.

## Let Postgres settle the race

Reading the taken amounts and inserting a session is a race: two buyers can check out at the same moment and pick the same free slot. Rather than lock, the insert itself is the reservation, enforced by a partial unique index:

```sql
CREATE UNIQUE INDEX sessions_open_amount_uniq
    ON sessions (lower(pay_to_address), amount_usdc)
    WHERE status IN ('pending', 'confirming');
```

Only open sessions participate, so an amount frees up the moment its session settles or expires. When the insert hits a unique violation, the service picks another offset and retries.

The index is keyed on the pay-to address, not the merchant. An earlier version keyed it on the merchant ID — until I noticed two merchants could share a wallet, hold the same open amount, and a payment meant for one would settle the other's order. A migration fixed it; the comment in that migration is longer than the SQL.

## Watching the chain

The watcher follows USDC `Transfer` events into addresses that have open sessions. One code path handles both live blocks and backfill: every tick asks for the chain head, scans forward from a bookmark stored in Postgres, and saves the new bookmark. If the service is down for an hour, settlement is delayed by an hour; no payment is lost.

Two details matter more than they look:

- **Re-scanning is idempotent.** Each tick re-reads the last 12 blocks and re-checks block hashes, in case of a reorg. Recording a transfer is unique on `(tx_hash, log_index)`, so seeing it twice is harmless.
- **Confirmations are counted, not assumed.** A session moves from `pending` to `confirming` when the transfer appears, and settles after 3 confirmations.

It currently runs against the public Base RPC. Polling every 15 seconds is well within what it tolerates, and it removed a paid dependency.

## The buyer who pays late

A quote expires after 15 minutes, because the USD price of the order is fixed at that point. But people get distracted, and a payment that arrives at minute 20 is still clearly meant for that order.

A separate sweep looks back over recently expired sessions and settles an exact-amount transfer that arrives within 24 hours of expiry. Only the exact amount counts here: after expiry, the slot may already belong to a new checkout, so anything fuzzier would be a guess.

## When the amount is not exact

Wallets pay the exact quote. Fiat on-ramps do not: they deliver roughly the requested amount, minus their fees or rounded to their own precision. So there are tolerance paths — a transfer between 50% and 110% of a quote can match an underpaid or overpaid session.

They fire only when exactly one open session could plausibly be meant. An ambiguous transfer is recorded as unmatched and shown to the operator. The matcher is a pure function precisely so it can be tested exhaustively; it is the one place where a bug quietly sends a buyer's money nowhere.

## Crediting the transaction to the app

Base supports ERC-8021 builder codes: an app appends a short attribution suffix to its transactions. The token contract only reads the arguments it expects, so extra bytes after `transfer(address,uint256)` are ignored, and the `Transfer` event the watcher matches on is unchanged.

The suffix is the code in ASCII, one length byte, a schema byte, and a 16-byte marker:

```ts
const ERC8021_MARKER = '80218021802180218021802180218021';

export function builderCodeSuffix(codes: readonly string[]): string {
  const text = codes.join(',');
  if (!/^[\x20-\x7e]{1,255}$/.test(text)) throw new Error('builder codes must be printable ASCII, 1-255 bytes');
  let hex = '';
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(2, '0');
  return `${hex}${text.length.toString(16).padStart(2, '0')}00${ERC8021_MARKER}`;
}
```

I checked it byte for byte against the reference encoding in `ox` before shipping, because a wrong suffix on a payment transaction is not something you want to learn about in production.

## What I would tell someone building the same thing

- **Pick one token on one network.** Every extra coin is another way for a buyer to send the right money on the wrong chain.
- **Make the database enforce the invariant.** The unique index caught a real bug that application code had missed.
- **Never guess.** Every ambiguous case goes to a human, not to the oldest session.
- **Be honest about the trade-off.** Non-custodial means the merchant sends refunds themselves and keeps USDC rather than getting a bank payout. For some shops that is the point; for others a custodial processor is the better fit.

StableCart is free for 20 paid orders a month, with no percentage on sales. The WooCommerce plugin is in review on WordPress.org and [downloads from the site](https://www.stablecart.org/accept-usdc-woocommerce/) until then, and there are [payment links](https://www.stablecart.org/links/) for anyone without a shop. Questions and criticism are welcome in the comments.
