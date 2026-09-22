import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import type { Config } from '../../src/config.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { Watcher } from '../../src/watcher/watcher.js';
import { verifySignature } from '../../src/webhooks/signature.js';
import { FakeChain } from '../helpers/fakeChain.js';
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

  it('registers a payment-link seller with no webhook at all', async () => {
    const response = await call('POST', '/api/merchants', {
      walletAddress: MERCHANT_ADDRESS,
      name: 'Fedja Photography',
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.merchantId).toMatch(/^fedja-photography-[0-9a-f]{8}$/);
    expect(body.merchantKey).toMatch(/^bpk_/);
    expect(shop.calls).toEqual([]); // nothing to verify, so nothing was called

    // The key still works, and the merchant can take payments immediately.
    const me = await call('GET', `/api/merchants/${body.merchantId}`, undefined, {
      authorization: `Bearer ${body.merchantKey}`,
    });
    expect(await json(me)).toMatchObject({ webhookUrl: null, plan: 'free' });
    const session = await call('POST', '/api/sessions', { merchantId: body.merchantId, amountUsd: '25.00', orderRef: 'INVOICE-104' });
    expect(session.status).toBe(201);
    expect((await json(session)).payToAddress).toBe(MERCHANT_ADDRESS);
  });

  it('rejects a webhook url without its secret', async () => {
    const response = await call('POST', '/api/merchants', { walletAddress: MERCHANT_ADDRESS, webhookUrl: WEBHOOK_URL });
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe('INVALID_REQUEST');
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

describe.skipIf(!hasDatabase)('Pro billing', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await resetDatabase(pool);
    await seedMerchant(pool); // "demo", the shop that buys Pro
    await seedMerchant(pool, { id: 'basepay-billing', walletAddress: BUYER_ADDRESS });
  });

  async function payPro(amountUsd: string, orderRef = 'PRO-demo') {
    const config = testConfig({ WATCHER_ENABLED: 'true', CONFIRMATIONS_REQUIRED: '1' });
    const sessions = new SessionService(pool, config, fixedPriceService());
    const chain = new FakeChain('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 5);
    const watcher = new Watcher(pool, config, chain.asClient());
    await watcher.tick();
    const view = await sessions.createSession({ merchantId: 'basepay-billing', amountUsd, orderRef });
    chain.mine([{ to: BUYER_ADDRESS, value: BigInt(view.amountUsdcMicro) }]);
    await watcher.tick();
    await watcher.tick();
    return (await pool.query(`SELECT plan, plan_expires_at FROM merchants WHERE id = 'demo'`)).rows[0] as {
      plan: string;
      plan_expires_at: Date | null;
    };
  }

  it('switches a shop to Pro for 30 days when its $12 payment settles, and stacks renewals', async () => {
    const first = await payPro('12.00');
    expect(first.plan).toBe('pro');
    const days = (first.plan_expires_at!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    const second = await payPro('12.00');
    expect((second.plan_expires_at!.getTime() - Date.now()) / 86_400_000).toBeGreaterThan(59.9);
  });

  it('ignores a PRO- order below the price, and PRO- orders to any other merchant', async () => {
    expect((await payPro('0.50')).plan).toBe('free');
    const config = testConfig();
    const sessions = new SessionService(pool, config, fixedPriceService());
    await sessions.createSession({ merchantId: 'demo', amountUsd: '12.00', orderRef: 'PRO-demo' });
    expect((await pool.query(`SELECT plan FROM merchants WHERE id = 'demo'`)).rows[0].plan).toBe('free');
  });
});
