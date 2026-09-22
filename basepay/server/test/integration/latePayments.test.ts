import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { getSession } from '../../src/db/sessions.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { LateSweep } from '../../src/watcher/lateSweep.js';
import { Watcher } from '../../src/watcher/watcher.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { FakeChain } from '../helpers/fakeChain.js';
import { fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig } from '../helpers/fixtures.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

describe.skipIf(!hasDatabase)('late payments', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await resetDatabase(pool);
    await seedMerchant(pool, { webhookUrl: 'https://shop.example/hook', webhookSecret: 'whsec_late_payment_test_0123456789' });
  });

  function build(chain: FakeChain, overrides: Record<string, string> = {}) {
    const config: Config = testConfig({ WATCHER_ENABLED: 'true', CONFIRMATIONS_REQUIRED: '3', ...overrides });
    return {
      config,
      watcher: new Watcher(pool, config, chain.asClient()),
      sweep: new LateSweep(pool, config, chain.asClient()),
      sessions: new SessionService(pool, config, fixedPriceService()),
    };
  }

  const status = async (id: string) => (await getSession(pool, id))?.status;

  /** Opens a session and ages it past its deadline, the way the expiry sweep would. */
  async function expiredSession(sessions: SessionService, amountUsd = '25.00', expiredSecondsAgo = 60) {
    const view = await sessions.createSession({ merchantId: 'demo', amountUsd, orderRef: 'WC-1-abc' });
    await pool.query(
      `UPDATE sessions SET created_at = now() - interval '20 minutes',
                           expires_at = now() - make_interval(secs => $2::double precision) WHERE id = $1`,
      [view.sessionId, expiredSecondsAgo],
    );
    await sessions.sweepExpired();
    expect(await status(view.sessionId)).toBe('expired');
    return view;
  }

  const confirm = (chain: FakeChain) => {
    chain.mine();
    chain.mine();
  };

  it('settles an exact payment that arrives after the quote expired', async () => {
    const chain = new FakeChain(USDC, 10);
    const { watcher, sweep, sessions } = build(chain);
    await watcher.tick();
    await sweep.tick();

    const session = await expiredSession(sessions);
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    confirm(chain);

    // The live watcher has nothing open, so it does not see it.
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('expired');

    expect(await sweep.tick()).toBe(1);
    expect(await status(session.sessionId)).toBe('confirming');

    await watcher.tick();
    expect(await status(session.sessionId)).toBe('paid');

    const { rows } = await pool.query(
      `SELECT event_type FROM webhook_deliveries WHERE session_id = $1`,
      [session.sessionId],
    );
    expect(rows.map((r) => r.event_type)).toEqual(['payment.paid']);
  });

  it('finds a late payment from before the sweep ever ran (cold start looks back over the window)', async () => {
    const chain = new FakeChain(USDC, 5);
    const { watcher, sweep, sessions } = build(chain);
    const session = await expiredSession(sessions);
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    for (let i = 0; i < 30; i += 1) chain.mine();

    expect(await sweep.tick()).toBe(1);
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('paid');
  });

  it('ignores a transfer that predates the session', async () => {
    const chain = new FakeChain(USDC, 10);
    const { sweep, sessions } = build(chain);
    await sweep.tick();

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '25.00' });
    // Same amount, but mined an hour before the session existed.
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }], new Date(Date.now() - 3_600_000));
    confirm(chain);
    await pool.query(`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = $1`, [session.sessionId]);
    await sessions.sweepExpired();

    expect(await sweep.tick()).toBe(0);
    expect(await status(session.sessionId)).toBe('expired');
  });

  it('leaves the amount to an open session holding it, and ignores sessions outside the window', async () => {
    const chain = new FakeChain(USDC, 10);
    const { sweep, sessions } = build(chain, { LATE_PAYMENT_WINDOW_SECONDS: '3600' });
    await sweep.tick();

    const old = await expiredSession(sessions, '25.00', 7200);
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(old.amountUsdcMicro) }]);
    confirm(chain);
    expect(await sweep.tick()).toBe(0);
    expect(await status(old.sessionId)).toBe('expired');

    const recent = await expiredSession(sessions, '30.00');
    const open = await sessions.createSession({ merchantId: 'demo', amountUsd: '30.00' });
    expect(open.amountUsdcMicro).toBe(recent.amountUsdcMicro); // the freed slot was reused
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(recent.amountUsdcMicro) }]);
    confirm(chain);
    expect(await sweep.tick()).toBe(0);
    expect(await status(recent.sessionId)).toBe('expired');
  });

  it('costs no getLogs while nothing expired recently', async () => {
    const chain = new FakeChain(USDC, 10);
    const { sweep } = build(chain);
    await sweep.tick();
    for (let i = 0; i < 20; i += 1) chain.mine();
    const before = chain.calls.getLogs;
    await sweep.tick();
    await sweep.tick();
    expect(chain.calls.getLogs).toBe(before);
  });

  it('is off when the window is zero', async () => {
    const chain = new FakeChain(USDC, 10);
    const { sweep, sessions } = build(chain, { LATE_PAYMENT_WINDOW_SECONDS: '0' });
    const session = await expiredSession(sessions);
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    confirm(chain);
    expect(await sweep.tick()).toBe(0);
    expect(chain.calls.getBlockNumber).toBe(0);
  });
});
