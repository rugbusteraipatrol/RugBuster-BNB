/**
 * Reference BasePay webhook receiver (Node, no dependencies).
 *
 * This is the piece that lives on the MERCHANT's side. BasePay tells you a
 * payment arrived; this endpoint is what turns that into "order fulfilled".
 *
 * Copy it, replace `markOrderPaid` / `flagUnderpayment` with your own logic,
 * and you are done. The parts that are easy to get wrong are commented.
 *
 *   node server.mjs
 *   WEBHOOK_SECRET=... PORT=4001 node server.mjs
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4001);
const SECRET = process.env.WEBHOOK_SECRET ?? '';
const PATH = process.env.WEBHOOK_PATH ?? '/hooks/basepay';

/** Reject deliveries whose timestamp is further than this from now, in seconds. */
const TOLERANCE_SECONDS = 300;
/** Bound the body so a bad actor cannot make you buffer forever. */
const MAX_BODY_BYTES = 128 * 1024;

if (!SECRET) {
  console.error('WEBHOOK_SECRET is not set. Refusing to start: every delivery would be rejected.');
  process.exit(1);
}

// ---------------------------------------------------------------- your code

/**
 * Called once per session that reaches `paid`. Put your fulfilment here.
 *
 * `orderRef` is whatever you passed when creating the session, so this is
 * normally a single UPDATE against your own orders table.
 */
async function markOrderPaid(data) {
  console.log(`PAID  order=${data.orderRef} amount=$${data.amountUsd} (${data.amountUsdc} USDC)`);
  console.log(`      tx=${data.transactions[0]?.txHash ?? 'n/a'}`);
  // await db.orders.update({ where: { ref: data.orderRef }, data: { status: 'paid' } });
}

/**
 * Called once per session that reaches `underpaid`. The buyer sent less than
 * the quote. The funds are already in your wallet and BasePay cannot send them
 * back — it holds no keys. Decide here: refund manually, part-ship, or contact
 * the buyer. Do not fulfil automatically.
 */
async function flagUnderpayment(data) {
  console.warn(`UNDERPAID order=${data.orderRef} received ${data.receivedUsdc} of ${data.amountUsdc} USDC`);
  // await db.orders.update({ where: { ref: data.orderRef }, data: { status: 'needs_review' } });
}

// ------------------------------------------------------------- plumbing

/**
 * Deliveries you have already processed.
 *
 * In production this MUST be durable — a table with a unique index on the
 * delivery id — not an in-memory Set. A restart with an in-memory set means a
 * retried delivery gets processed twice, and double-fulfilling an order costs
 * real money.
 */
const processed = new Set();

/**
 * The signature covers `${timestamp}.${rawBody}`.
 *
 * Verify against the RAW BYTES you received. If you parse the JSON and
 * re-serialise it, key order and whitespace change and the signature will never
 * match — this is the single most common integration bug.
 */
function verify(rawBody, headers) {
  const timestamp = Number(headers['x-basepay-timestamp']);
  if (!Number.isInteger(timestamp)) return 'missing or malformed timestamp header';

  // Bounded in both directions: a timestamp from the future is as suspect as an old one.
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) {
    return 'timestamp outside the replay window';
  }

  const presented = String(headers['x-basepay-signature'] ?? '').replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/i.test(presented)) return 'missing or malformed signature header';

  const expected = createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest();
  const actual = Buffer.from(presented.toLowerCase(), 'hex');

  // Constant-time compare, so response timing cannot be used to forge a signature.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return 'signature mismatch';
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.startsWith(PATH)) {
    res.writeHead(404).end();
    return;
  }

  let rawBody;
  try {
    rawBody = await readBody(req);
  } catch {
    res.writeHead(413).end();
    return;
  }

  // Verify BEFORE parsing. Until the signature checks out, this is bytes from a
  // stranger, not a payment notification.
  const problem = verify(rawBody, req.headers);
  if (problem) {
    console.warn(`rejected delivery: ${problem}`);
    // 400 tells BasePay this attempt failed; it will retry with backoff and
    // eventually dead-letter, which is what you want if your secret is wrong.
    res.writeHead(400).end();
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.writeHead(400).end();
    return;
  }

  // `event.id` is stable across every retry of the same delivery, so it is the
  // idempotency key. BasePay already guarantees at most one delivery per
  // (session, event) — this guards against the retries of that one delivery.
  if (processed.has(event.id)) {
    console.log(`duplicate delivery ${event.id} ignored`);
    res.writeHead(200).end();
    return;
  }

  try {
    switch (event.type) {
      case 'payment.paid':
        await markOrderPaid(event.data);
        break;
      case 'payment.underpaid':
        await flagUnderpayment(event.data);
        break;
      default:
        // Unknown event types are not an error: acknowledge so BasePay stops
        // retrying, and ignore. This is what lets new event types ship safely.
        console.log(`ignoring unknown event type ${event.type}`);
    }
    processed.add(event.id);
    res.writeHead(200).end();
  } catch (err) {
    // Your own failure. Return 5xx so the delivery is retried rather than lost.
    console.error(`handler failed for ${event.id}:`, err);
    res.writeHead(500).end();
  }
}).listen(PORT, () => {
  console.log(`BasePay webhook receiver listening on http://0.0.0.0:${PORT}${PATH}`);
});
