import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { Config } from '../../src/config.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { Settlement } from '../../src/watcher/settlement.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { json } from '../helpers/http.js';
import { fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig, transfer } from '../helpers/fixtures.js';

describe.skipIf(!hasDatabase)('HTTP API', () => {
  let pool: pg.Pool;
  let server: Server;
  let baseUrl: string;
  let config: Config;

  beforeAll(async () => {
    pool = await createTestPool();
    config = testConfig({ SERVE_WIDGET: 'false' });
    const app = createApp({
      config,
      pool,
      priceService: fixedPriceService(),
      sessionService: new SessionService(pool, config, fixedPriceService()),
      watcher: null,
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await seedMerchant(pool);
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  describe('POST /api/sessions', () => {
    it('creates a session', async () => {
      const response = await post('/api/sessions', { merchantId: 'demo', amountUsd: 45, orderRef: 'A-1' });
      expect(response.status).toBe(201);

      const body = await json(response);
      expect(body).toMatchObject({
        status: 'pending',
        amountUsd: '45.00',
        amountUsdc: '45.000000',
        payToAddress: MERCHANT_ADDRESS,
        chainId: 8453,
        orderRef: 'A-1',
        onramp: null,
      });
      expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('accepts the amount as a string as well as a number', async () => {
      const response = await post('/api/sessions', { merchantId: 'demo', amountUsd: '19.99' });
      expect(response.status).toBe(201);
      expect((await json(response)).amountUsd).toBe('19.99');
    });

    it('rejects a malformed body with a machine-readable code', async () => {
      for (const body of [{}, { merchantId: 'demo' }, { amountUsd: 45 }, { merchantId: '', amountUsd: 45 }]) {
        const response = await post('/api/sessions', body);
        expect(response.status).toBe(400);
        expect((await json(response)).error.code).toBe('INVALID_REQUEST');
      }
    });

    it('rejects a non-positive or over-precise amount', async () => {
      expect((await post('/api/sessions', { merchantId: 'demo', amountUsd: 0 })).status).toBe(400);
      expect((await post('/api/sessions', { merchantId: 'demo', amountUsd: -5 })).status).toBe(400);

      const overPrecise = await post('/api/sessions', { merchantId: 'demo', amountUsd: '45.001' });
      expect(overPrecise.status).toBe(409);
      expect((await json(overPrecise)).error.code).toBe('INVALID_AMOUNT');
    });

    it('404s an unknown merchant', async () => {
      const response = await post('/api/sessions', { merchantId: 'ghost', amountUsd: 45 });
      expect(response.status).toBe(404);
      expect((await json(response)).error.code).toBe('MERCHANT_NOT_FOUND');
    });

    it('sends CORS headers, because the widget runs on the merchant domain', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://shop.webflow.io',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      expect(response.status).toBeLessThan(300);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('reflects settlement progress', async () => {
      const created = await json(await post('/api/sessions', { merchantId: 'demo', amountUsd: 45 }));

      let response = await fetch(`${baseUrl}/api/sessions/${created.sessionId}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await json(response)).status).toBe('pending');

      const settlement = new Settlement(pool, config);
      await settlement.applyTransfer(
        transfer({ to: MERCHANT_ADDRESS, value: BigInt(created.amountUsdcMicro), blockNumber: 100n }),
      );

      response = await fetch(`${baseUrl}/api/sessions/${created.sessionId}`);
      let body = await json(response);
      expect(body.status).toBe('confirming');
      expect(body.confirmations).toBe(1);
      expect(body.confirmationsRequired).toBe(3);
      expect(body.transactions).toHaveLength(1);

      await settlement.advanceConfirmations(102n);
      body = await json(await fetch(`${baseUrl}/api/sessions/${created.sessionId}`));
      expect(body.status).toBe('paid');
      expect(body.receivedUsdc).toBe('45.000000');
      expect(body.settledAt).not.toBeNull();
    });

    it('404s an unknown or malformed id without leaking a database error', async () => {
      for (const id of ['11111111-1111-4111-8111-111111111111', 'not-a-uuid', '1; DROP TABLE sessions']) {
        const response = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(id)}`);
        expect(response.status).toBe(404);
        expect((await json(response)).error.code).toBe('SESSION_NOT_FOUND');
      }
      // The injection attempt did not do anything.
      expect((await pool.query('SELECT count(*) FROM sessions')).rows).toHaveLength(1);
    });
  });

  describe('admin API', () => {
    const auth = { authorization: 'Bearer test-admin-token' };

    it('requires a bearer token', async () => {
      expect((await fetch(`${baseUrl}/admin/merchants`)).status).toBe(401);
      expect((await fetch(`${baseUrl}/admin/merchants`, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
      expect((await fetch(`${baseUrl}/admin/merchants`, { headers: auth })).status).toBe(200);
    });

    it('registers a merchant and normalises the address', async () => {
      const response = await post(
        '/admin/merchants',
        {
          merchantId: 'acme',
          walletAddress: MERCHANT_ADDRESS.toLowerCase(),
          webhookUrl: 'https://acme.example/hooks',
          webhookSecret: 'whsec_acme_secret_value_0123',
        },
        auth,
      );
      expect(response.status).toBe(201);
      const body = await json(response);
      expect(body.walletAddress).toBe(MERCHANT_ADDRESS);
      expect(body.webhookConfigured).toBe(true);
      // The secret is never echoed back.
      expect(JSON.stringify(body)).not.toContain('whsec_');
    });

    it('rejects a bad address and a half-configured webhook', async () => {
      expect((await post('/admin/merchants', { merchantId: 'a', walletAddress: '0xnope' }, auth)).status).toBe(400);
      expect(
        (await post('/admin/merchants', { merchantId: 'a', walletAddress: MERCHANT_ADDRESS, webhookUrl: 'https://x.example/h' }, auth))
          .status,
      ).toBe(400);
    });

    it('lists payments that could not be attributed', async () => {
      await new Settlement(pool, config).applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: 12_345_678n }));

      const body = await json(await fetch(`${baseUrl}/admin/payments/unmatched`, { headers: auth }));
      expect(body.payments).toHaveLength(1);
      expect(body.payments[0].amountUsdc).toBe('12.345678');
    });
  });

  describe('health', () => {
    it('reports liveness and readiness', async () => {
      const health = await json(await fetch(`${baseUrl}/healthz`));
      expect(health).toMatchObject({ status: 'ok', chainId: 8453 });

      const ready = await fetch(`${baseUrl}/readyz`);
      expect(ready.status).toBe(200);
      const body = await json(ready);
      expect(body.status).toBe('ready');
      expect(body.checks.database).toEqual({ ok: true });
      expect(body.checks.price.ok).toBe(true);
    });
  });

  it('404s an unknown endpoint as JSON', async () => {
    const response = await fetch(`${baseUrl}/nope`);
    expect(response.status).toBe(404);
    expect((await json(response)).error.code).toBe('NOT_FOUND');
  });
});
