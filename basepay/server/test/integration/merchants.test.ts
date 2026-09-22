import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { Config } from '../../src/config.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { verifySignature } from '../../src/webhooks/signature.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { json } from '../helpers/http.js';
import { BUYER_ADDRESS, fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig } from '../helpers/fixtures.js';

const WEBHOOK_SECRET = 'whsec_integration_test_secret_0123456789';
const WEBHOOK_URL = 'https://shop.example/?wc-api=basepay';

/** Stands in for the merchant's site: verifies the signature and echoes the challenge. */
function fakeShop(secret = WEBHOOK_SECRET) {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push(url);
    const headers = init.headers as Record<string, string>;
    const rawBody = String(init.body);
    const ok = verifySignature({
      secret,
      rawBody,
      timestamp: headers['x-basepay-timestamp'] ?? '',
      signature: headers['x-basepay-signature'] ?? '',
    });
    if (!ok) return new Response('bad signature', { status: 401 });
    const body = JSON.parse(rawBody) as { type: string; data: { challenge: string } };
    return new Response(JSON.stringify({ challenge: body.data.challenge }), { status: 200 });
  };
  return { calls, fetchImpl };
}

describe.skipIf(!hasDatabase)('merchant self-registration and plans', () => {
  let pool: pg.Pool;
  let server: Server;
  let baseUrl: string;
  let config: Config;
  const shop = fakeShop();

  beforeAll(async () => {
    pool = await createTestPool();
    config = testConfig({ SERVE_WIDGET: 'false', FREE_PLAN_MONTHLY_ORDERS: '2' });
    const app = createApp({
      config,
      pool,
      priceService: fixedPriceService(),
      sessionService: new SessionService(pool, config, fixedPriceService()),
      watcher: null,
      merchantRoutes: { fetchImpl: shop.fetchImpl },
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
    shop.calls.length = 0;
  });

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const register = () =>
    call('POST', '/api/merchants', {
      walletAddress: MERCHANT_ADDRESS,
      webhookUrl: WEBHOOK_URL,
      webhookSecret: WEBHOOK_SECRET,
      siteUrl: 'https://shop.example',
      platform: 'woocommerce',
    });

  it('registers a merchant after the webhook echoes a signed challenge', async () => {
    const response = await register();
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.merchantId).toMatch(/^shop-example-[0-9a-f]{8}$/);
    expect(body.merchantKey).toMatch(/^bpk_/);
    expect(body).toMatchObject({
      walletAddress: MERCHANT_ADDRESS,
      plan: 'free',
      usage: { paidOrders: 0, limit: 2 },
    });
    expect(shop.calls).toEqual([WEBHOOK_URL]);

    // The merchant can pay right away.
    const session = await call('POST', '/api/sessions', { merchantId: body.merchantId, amountUsd: 10 });
    expect(session.status).toBe(201);
    expect((await json(session)).payToAddress).toBe(MERCHANT_ADDRESS);
  });

  it('refuses to register when the site cannot prove it holds the secret', async () => {
    const response = await call('POST', '/api/merchants', {
      walletAddress: MERCHANT_ADDRESS,
      webhookUrl: WEBHOOK_URL,
      webhookSecret: 'a_different_secret_that_is_long_enough_00',
    });
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe('WEBHOOK_REJECTED');
    expect((await pool.query('SELECT count(*)::int AS n FROM merchants')).rows[0].n).toBe(0);
  });

  it('lets the key holder read usage and change the wallet, and nobody else', async () => {
    const { merchantId, merchantKey } = await json(await register());
    const auth = { authorization: `Bearer ${merchantKey}` };

    expect((await call('GET', `/api/merchants/${merchantId}`)).status).toBe(401);
    expect((await call('GET', `/api/merchants/${merchantId}`, undefined, { authorization: 'Bearer bpk_nope' })).status).toBe(401);

    const me = await call('GET', `/api/merchants/${merchantId}`, undefined, auth);
    expect(me.status).toBe(200);
    expect(await json(me)).toMatchObject({ merchantId, webhookUrl: WEBHOOK_URL, plan: 'free', usage: { limit: 2 } });

    const patched = await call('PATCH', `/api/merchants/${merchantId}`, { walletAddress: BUYER_ADDRESS }, auth);
    expect(patched.status).toBe(200);
    expect((await json(patched)).walletAddress).toBe(BUYER_ADDRESS);
  });

  it('seeded merchants have no key and cannot use the self-service API', async () => {
    await seedMerchant(pool);
    const response = await call('GET', '/api/merchants/demo', undefined, { authorization: 'Bearer bpk_anything' });
    expect(response.status).toBe(401);
  });

  it('caps a free merchant at the monthly order limit and lifts it on pro', async () => {
    await seedMerchant(pool);
    const paid = async (n: number) => {
      for (let i = 0; i < n; i += 1) {
        const created = await json(await call('POST', '/api/sessions', { merchantId: 'demo', amountUsd: 5 }));
        await pool.query(
          `UPDATE sessions SET status = 'paid', first_seen_at = now(), settled_at = now() WHERE id = $1`,
          [created.sessionId],
        );
      }
    };

    await paid(2);
    const refused = await call('POST', '/api/sessions', { merchantId: 'demo', amountUsd: 5 });
    expect(refused.status).toBe(402);
    expect((await json(refused)).error).toMatchObject({ code: 'PLAN_LIMIT_REACHED', details: { monthlyOrders: 2 } });

    // Last month's sales do not count.
    await pool.query(`UPDATE sessions SET first_seen_at = now() - interval '40 days'`);
    expect((await call('POST', '/api/sessions', { merchantId: 'demo', amountUsd: 5 })).status).toBe(201);

    await paid(2);
    const admin = { authorization: 'Bearer test-admin-token' };
    const upgraded = await call('POST', '/admin/merchants/demo/plan', { plan: 'pro' }, admin);
    expect(upgraded.status).toBe(200);
    expect((await json(upgraded)).plan).toBe('pro');
    expect((await call('POST', '/api/sessions', { merchantId: 'demo', amountUsd: 5 })).status).toBe(201);

    const lapsed = await call('POST', '/admin/merchants/demo/plan', { plan: 'pro', expiresAt: '2020-01-01T00:00:00Z' }, admin);
    expect((await json(lapsed)).plan).toBe('free');
    expect((await call('POST', '/api/sessions', { merchantId: 'demo', amountUsd: 5 })).status).toBe(402);
  });
});
