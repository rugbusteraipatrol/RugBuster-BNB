import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { getMerchant } from '../../src/db/merchants.js';
import { listDeadLetters, listDeliveriesForSession } from '../../src/db/webhookDeliveries.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { Settlement } from '../../src/watcher/settlement.js';
import { backoffSeconds, WebhookWorker } from '../../src/webhooks/dispatcher.js';
import { verifySignature } from '../../src/webhooks/signature.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig, transfer } from '../helpers/fixtures.js';

const SECRET = 'whsec_integration_secret_value_01';

interface Received {
  body: string;
  headers: Record<string, string | undefined>;
}

/** A merchant endpoint we control, so deliveries can be inspected byte for byte. */
async function startReceiver(handler: (received: Received) => number): Promise<{
  url: string;
  received: Received[];
  close: () => Promise<void>;
  server: Server;
}> {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const entry: Received = {
        body: Buffer.concat(chunks).toString('utf8'),
        headers: req.headers as Record<string, string | undefined>,
      };
      received.push(entry);
      res.writeHead(handler(entry)).end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/hooks`,
    received,
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe.skipIf(!hasDatabase)('webhook delivery', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await resetDatabase(pool);
  });

  async function settleSession(config: Config, webhookUrl: string): Promise<string> {
    await seedMerchant(pool, { webhookUrl, webhookSecret: SECRET });
    const sessions = new SessionService(pool, config, fixedPriceService());
    const settlement = new Settlement(pool, config);

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00', orderRef: 'ORDER-9' });
    await settlement.applyTransfer(
      transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro), blockNumber: 100n }),
    );
    await settlement.advanceConfirmations(102n);
    return session.sessionId;
  }

  const worker = (config: Config) =>
    new WebhookWorker(pool, config, async (merchantId) => (await getMerchant(pool, merchantId))?.webhookSecret ?? null);

  it('delivers a signed payload the merchant can verify', async () => {
    const receiver = await startReceiver(() => 200);
    try {
      const config = testConfig();
      const sessionId = await settleSession(config, receiver.url);

      const results = await worker(config).tick();
      expect(results).toEqual([expect.objectContaining({ outcome: 'delivered', statusCode: 200 })]);
      expect(receiver.received).toHaveLength(1);

      const delivery = receiver.received[0];
      const signature = delivery?.headers['x-basepay-signature'] ?? '';
      const timestamp = delivery?.headers['x-basepay-timestamp'] ?? '';

      expect(delivery?.headers['x-basepay-event']).toBe('payment.paid');
      expect(delivery?.headers['content-type']).toBe('application/json');
      expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);

      // Exactly what a merchant would run on their side.
      expect(verifySignature({ secret: SECRET, rawBody: delivery?.body ?? '', timestamp, signature })).toBe(true);
      expect(verifySignature({ secret: 'wrong-secret-value-aaaaaaaaaaaa', rawBody: delivery?.body ?? '', timestamp, signature })).toBe(false);

      const payload = JSON.parse(delivery?.body ?? '{}');
      expect(payload).toMatchObject({
        type: 'payment.paid',
        data: {
          sessionId,
          merchantId: 'demo',
          orderRef: 'ORDER-9',
          status: 'paid',
          amountUsd: '45.00',
          chainId: 8453,
          token: { symbol: 'USDC', decimals: 6 },
        },
      });
      expect(payload.data.transactions).toHaveLength(1);

      const deliveries = await listDeliveriesForSession(pool, sessionId);
      expect(deliveries[0]?.status).toBe('delivered');
      expect(deliveries[0]?.attempts).toBe(1);
    } finally {
      await receiver.close();
    }
  });

  it('retries a failing endpoint with backoff and dead-letters after the cap', async () => {
    const receiver = await startReceiver(() => 500);
    try {
      // Zero backoff so the retries are due immediately; the backoff arithmetic
      // itself is asserted separately below.
      const config = testConfig({ WEBHOOK_MAX_ATTEMPTS: '3', WEBHOOK_BACKOFF_BASE_SECONDS: '1' });
      const sessionId = await settleSession(config, receiver.url);
      const dispatcher = worker(config);

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const results = await dispatcher.tick();
        expect(results[0]?.outcome).toBe(attempt < 3 ? 'retry' : 'dead');
        // Make the next attempt due without waiting out the backoff.
        await pool.query(`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE status = 'pending'`);
      }

      expect(receiver.received).toHaveLength(3);

      const deliveries = await listDeliveriesForSession(pool, sessionId);
      expect(deliveries[0]?.status).toBe('dead');
      expect(deliveries[0]?.attempts).toBe(3);
      expect(deliveries[0]?.lastStatusCode).toBe(500);
      expect(await listDeadLetters(pool)).toHaveLength(1);

      // A dead letter is never retried again.
      expect(await dispatcher.tick()).toEqual([]);
      expect(receiver.received).toHaveLength(3);
    } finally {
      await receiver.close();
    }
  });

  it('stops retrying as soon as the merchant recovers', async () => {
    let healthy = false;
    const receiver = await startReceiver(() => (healthy ? 200 : 503));
    try {
      const config = testConfig({ WEBHOOK_MAX_ATTEMPTS: '6', WEBHOOK_BACKOFF_BASE_SECONDS: '1' });
      const sessionId = await settleSession(config, receiver.url);
      const dispatcher = worker(config);

      expect((await dispatcher.tick())[0]?.outcome).toBe('retry');
      await pool.query(`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE status = 'pending'`);

      healthy = true;
      expect((await dispatcher.tick())[0]?.outcome).toBe('delivered');

      const deliveries = await listDeliveriesForSession(pool, sessionId);
      expect(deliveries[0]?.status).toBe('delivered');
      expect(deliveries[0]?.attempts).toBe(2);
      expect(deliveries[0]?.deliveredAt).not.toBeNull();
    } finally {
      await receiver.close();
    }
  });

  it('treats a hung endpoint as a failed attempt rather than blocking the queue', async () => {
    const server = createServer(() => {
      // Never responds.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };

    try {
      const config = testConfig({ WEBHOOK_TIMEOUT_MS: '300', WEBHOOK_MAX_ATTEMPTS: '2' });
      await settleSession(config, `http://127.0.0.1:${port}/hooks`);

      const results = await worker(config).tick();
      expect(results[0]?.outcome).toBe('retry');
      expect(results[0]?.statusCode).toBeNull();
      expect(results[0]?.error).toBeTruthy();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('never notifies a merchant with no webhook configured', async () => {
    const config = testConfig();
    await seedMerchant(pool, { webhookUrl: null, webhookSecret: null });
    const sessions = new SessionService(pool, config, fixedPriceService());
    const settlement = new Settlement(pool, config);

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    await settlement.applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }));
    await settlement.advanceConfirmations(102n);

    expect(await listDeliveriesForSession(pool, session.sessionId)).toHaveLength(0);
  });
});

describe('backoff schedule', () => {
  it('doubles each attempt, with jitter, and stays under an hour', () => {
    const noJitter = () => 0;
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffSeconds(n, 5, noJitter))).toEqual([5, 10, 20, 40, 80, 160]);
    expect(backoffSeconds(20, 5, noJitter)).toBe(3600);
  });

  it('adds up to 20% jitter so retries do not stampede', () => {
    expect(backoffSeconds(0, 10, () => 0)).toBe(10);
    expect(backoffSeconds(0, 10, () => 1)).toBe(12);
    expect(backoffSeconds(0, 10, () => 0.5)).toBe(11);
  });
});
