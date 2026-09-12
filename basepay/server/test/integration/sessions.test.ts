import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getSession, takenAmountsInRange } from '../../src/db/sessions.js';
import { PriceService } from '../../src/price/priceService.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig } from '../helpers/fixtures.js';

describe.skipIf(!hasDatabase)('session creation and amount reservation', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await resetDatabase(pool);
    await seedMerchant(pool);
  });

  const service = (overrides: Record<string, string> = {}, price?: PriceService) =>
    new SessionService(pool, testConfig(overrides), price ?? fixedPriceService());

  it('quotes a session and returns everything the widget needs', async () => {
    const view = await service().createSession({ merchantId: 'demo', amountUsd: '45.00', orderRef: 'ORDER-1' });

    expect(view.status).toBe('pending');
    expect(view.amountUsd).toBe('45.00');
    expect(view.amountUsdc).toBe('45.000000');
    expect(view.payToAddress).toBe(MERCHANT_ADDRESS);
    expect(view.chainId).toBe(8453);
    expect(view.orderRef).toBe('ORDER-1');
    expect(view.paymentUri).toBe(
      `ethereum:${view.token.address}@8453/transfer?address=${MERCHANT_ADDRESS}&uint256=45000000`,
    );
    // createdAt comes from the database clock and expiresAt from the app clock,
    // so allow a little skew around the 15 minute TTL.
    const ttlMs = new Date(view.expiresAt).getTime() - new Date(view.createdAt).getTime();
    expect(ttlMs).toBeGreaterThan(895_000);
    expect(ttlMs).toBeLessThanOrEqual(905_000);
  });

  it('gives concurrent sessions for the same price distinct amounts', async () => {
    const sessions = service();
    const views = await Promise.all(
      Array.from({ length: 25 }, () => sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' })),
    );

    const amounts = views.map((v) => v.amountUsdcMicro);
    expect(new Set(amounts).size).toBe(25);
    // Every quote sits inside the offset window above the true price.
    for (const amount of amounts) {
      expect(BigInt(amount)).toBeGreaterThanOrEqual(45_000_000n);
      expect(BigInt(amount)).toBeLessThan(45_001_000n);
    }
  });

  it('holds the reservation for open sessions only, and releases it on expiry', async () => {
    const sessions = service({ SESSION_TTL_SECONDS: '60' });
    const first = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    expect(first.amountUsdcMicro).toBe('45000000');

    const second = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    expect(second.amountUsdcMicro).toBe('45000001');

    // Force the first session past its deadline, then sweep.
    await pool.query(`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = $1`, [first.sessionId]);
    const expired = await sessions.sweepExpired();
    expect(expired.map((s) => s.id)).toEqual([first.sessionId]);

    // The released slot is handed out again, lowest-first.
    const third = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    expect(third.amountUsdcMicro).toBe('45000000');
  });

  it('never expires a confirming session, because money is already in flight', async () => {
    const sessions = service();
    const view = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    await pool.query(
      `UPDATE sessions SET status = 'confirming', expires_at = now() - interval '1 hour' WHERE id = $1`,
      [view.sessionId],
    );

    expect(await sessions.sweepExpired()).toHaveLength(0);
    expect((await getSession(pool, view.sessionId))?.status).toBe('confirming');
  });

  it('rejects a new session instead of reusing an amount when the window is full', async () => {
    const sessions = service({ AMOUNT_OFFSET_MAX: '3' });
    for (let i = 0; i < 3; i += 1) {
      await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    }

    await expect(sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' })).rejects.toMatchObject({
      code: 'AMOUNT_SLOTS_EXHAUSTED',
      statusCode: 409,
    });

    // A different price is a different window, so other checkouts still work.
    const other = await sessions.createSession({ merchantId: 'demo', amountUsd: '99.00' });
    expect(other.status).toBe('pending');
  });

  it('keeps two merchants independent even at the same amount', async () => {
    await seedMerchant(pool, { id: 'other', walletAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' });
    const sessions = service();

    const a = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    const b = await sessions.createSession({ merchantId: 'other', amountUsd: '45.00' });

    expect(a.amountUsdcMicro).toBe('45000000');
    expect(b.amountUsdcMicro).toBe('45000000');
    expect(a.payToAddress).not.toBe(b.payToAddress);
  });

  it('survives a race on the same slot by retrying rather than violating the reservation', async () => {
    const sessions = service();
    const views = await Promise.all(
      Array.from({ length: 40 }, () => sessions.createSession({ merchantId: 'demo', amountUsd: '19.99' })),
    );

    const taken = await takenAmountsInRange(pool, 'demo', 19_990_000n, 19_991_000n);
    expect(taken.size).toBe(40);
    expect(new Set(views.map((v) => v.amountUsdcMicro)).size).toBe(40);
  });

  it('marks the quote stale when the price feed is degraded, and still quotes', async () => {
    let fail = false;
    let nowMs = Date.now();
    const price = new PriceService({
      fetchPrice: async () => {
        if (fail) throw new Error('down');
        return '1.00000000';
      },
      cacheTtlSeconds: 60,
      maxStaleSeconds: 600,
      now: () => nowMs,
    });
    await price.getQuote();
    fail = true;
    nowMs += 120_000;

    const view = await service({}, price).createSession({ merchantId: 'demo', amountUsd: '45.00' });
    expect(view.priceStale).toBe(true);
  });

  it('refuses to open a session when the price feed is too stale to trust', async () => {
    const price = new PriceService({
      fetchPrice: async () => {
        throw new Error('down');
      },
      cacheTtlSeconds: 60,
      maxStaleSeconds: 600,
    });

    await expect(service({}, price).createSession({ merchantId: 'demo', amountUsd: '45.00' })).rejects.toMatchObject({
      code: 'PRICE_UNAVAILABLE',
    });
  });

  it('rejects an unknown merchant and a bad amount', async () => {
    const sessions = service();
    await expect(sessions.createSession({ merchantId: 'nope', amountUsd: '45.00' })).rejects.toMatchObject({
      code: 'MERCHANT_NOT_FOUND',
    });
    await expect(sessions.createSession({ merchantId: 'demo', amountUsd: '45.001' })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
  });

  it('quotes above the USD amount when USDC trades below a dollar', async () => {
    const view = await service({}, fixedPriceService('0.99900000')).createSession({
      merchantId: 'demo',
      amountUsd: '45.00',
    });
    expect(view.amountUsdc).toBe('45.045045');
    expect(view.priceUsd).toBe('0.99900000');
  });

  it('returns null for an unknown session id', async () => {
    expect(await service().getSessionView('11111111-1111-4111-8111-111111111111')).toBeNull();
  });
});
