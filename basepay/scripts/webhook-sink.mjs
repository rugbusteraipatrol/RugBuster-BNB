/**
 * A merchant endpoint for local development.
 *
 * Verifies the BasePay signature exactly the way a real integration should, then
 * prints what it received. Used by docker-compose so the end-to-end demo shows a
 * signed webhook actually arriving.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4001);
const SECRET = process.env.WEBHOOK_SECRET ?? '';
const TOLERANCE_SECONDS = 300;

function verify(rawBody, timestampHeader, signatureHeader) {
  if (!SECRET) return { ok: false, reason: 'WEBHOOK_SECRET is not set' };

  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp)) return { ok: false, reason: 'bad timestamp header' };
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp outside the replay window' };
  }

  const presented = String(signatureHeader ?? '').replace(/^sha256=/, '');
  if (!/^[0-9a-f]{64}$/i.test(presented)) return { ok: false, reason: 'bad signature header' };

  // The MAC covers `${timestamp}.${rawBody}`, over the raw bytes.
  const expected = createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest();
  const actual = Buffer.from(presented.toLowerCase(), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}

createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const result = verify(rawBody, req.headers['x-basepay-timestamp'], req.headers['x-basepay-signature']);

    if (!result.ok) {
      console.error(`[webhook-sink] REJECTED (${result.reason})`);
      // Rejecting with 400 lets BasePay's retry and dead-letter path be exercised.
      res.writeHead(400).end();
      return;
    }

    const event = req.headers['x-basepay-event'];
    console.log(`[webhook-sink] verified ${event}`);
    console.log(JSON.stringify(JSON.parse(rawBody), null, 2));
    res.writeHead(200).end();
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[webhook-sink] listening on ${PORT}${SECRET ? '' : ' (no WEBHOOK_SECRET set: everything will be rejected)'}`);
});
