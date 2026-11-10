import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { getSession } from '../../src/db/sessions.js';
import type { TransakClient, WidgetRequest } from '../../src/onramp/transak.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { json } from '../helpers/http.js';
import { fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig } from '../helpers/fixtures.js';

const WIDGET_URL = 'https://global-stg.transak.com?apiKey=pk_test&sessionId=single-use';

describe.skipIf(!hasDatabase)('card checkout through Transak', () => {
  let pool: pg.Pool;
  let server: Server;
  let baseUrl: string;
  let sessions: SessionService;
  const requests: WidgetRequest[] = [];
  let transakDown = false;

  beforeAll(async () => {
    pool = await createTestPool();
    const config = testConfig({
      SERVE_WIDGET: 'false',
      ONRAMP_PROVIDER: 'transak',
      TRANSAK_API_KEY: 'pk_test',
      TRANSAK_API_SECRET: 'sk_test',
      TRANSAK_ENVIRONMENT: 'STAGING',
      PUBLIC_BASE_URL: 'https://pay.example.test',
    });
    const transak = {
      createWidgetUrl: async (request: WidgetRequest) => {
        if (transakDown) throw new Error('Transak unreachable');
        requests.push(request);
        return WIDGET_URL;
      },
    } as unknown as TransakClient;

    sessions = new SessionService(pool, config, fixedPriceService(), transak);
    const app = createApp({ config, pool, priceService: fixedPriceService(), sessionService: sessions, watcher: null });
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
    requests.length = 0;
    transakDown = false;
  });

  const open = (amountUsd = '45.00') => sessions.createSession({ merchantId: 'demo', amountUsd });
  const startCard = (sessionId: string) => fetch(`${baseUrl}/api/sessions/${sessionId}/onramp`, { method: 'POST' });

  it("offers the card path on the session, through BasePay's own page", async () => {
    const view = await open();
    expect(view.onramp).toEqual({
      provider: 'transak',
      label: 'Pay with card via Transak',
      url: `https://pay.example.test/onramp/${view.sessionId}`,
    });
  });

  it('creates a widget URL paying the merchant, and holds the session while the card payment is delivered', async () => {
    const view = await open();

    const response = await startCard(view.sessionId);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await json(response)).toEqual({ url: WIDGET_URL });

    expect(requests).toEqual([
      {
        walletAddress: MERCHANT_ADDRESS,
        fiatAmountUsd: '45.00',
        partnerOrderId: view.sessionId,
        referrerDomain: 'pay.example.test',
        userIp: '127.0.0.1',
      },
    ]);

    // Held for ONRAMP_SESSION_TTL_SECONDS (two hours), not the 15-minute quote window.
    const held = await getSession(pool, view.sessionId);
    expect((held?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(115 * 60_000);
  });

  it("refuses an amount below Transak's card minimum", async () => {
    const view = await open('4.99');
    expect(view.onramp).toBeNull();

    const response = await startCard(view.sessionId);
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe('ONRAMP_AMOUNT_TOO_SMALL');
    expect(requests).toHaveLength(0);
  });

  it('refuses a session that is no longer waiting for payment', async () => {
    const view = await open();
    await pool.query(`UPDATE sessions SET status = 'expired' WHERE id = $1`, [view.sessionId]);

    const response = await startCard(view.sessionId);
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe('SESSION_NOT_OPEN');
    expect(requests).toHaveLength(0);
  });

  it('answers 503, not a broken link, when Transak cannot be reached', async () => {
    transakDown = true;
    const response = await startCard((await open()).sessionId);
    expect(response.status).toBe(503);
    expect((await json(response)).error.code).toBe('ONRAMP_UNAVAILABLE');
  });

  it('404s an unknown session', async () => {
    const response = await startCard('11111111-1111-4111-8111-111111111111');
    expect(response.status).toBe(404);
    expect((await startCard('not-a-session')).status).toBe(404);
  });

  it("serves the hand-off page from BasePay's origin with a Referer Transak can check", async () => {
    const view = await open();
    const response = await fetch(`${baseUrl}/onramp/${view.sessionId}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain(`/api/sessions/${view.sessionId}/onramp`);

    expect((await fetch(`${baseUrl}/onramp/not-a-session`)).status).toBe(404);
  });
});
