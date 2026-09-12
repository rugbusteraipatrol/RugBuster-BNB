import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { listActivePaymentsForSession, listUnmatchedPayments } from '../../src/db/payments.js';
import { getSession } from '../../src/db/sessions.js';
import { getWatcherState } from '../../src/db/watcherState.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { watcherStateId } from '../../src/watcher/constants.js';
import { Watcher } from '../../src/watcher/watcher.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { FakeChain } from '../helpers/fakeChain.js';
import { fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig } from '../helpers/fixtures.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OTHER_ADDRESS = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

describe.skipIf(!hasDatabase)('watcher loop', () => {
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

  function build(chain: FakeChain, overrides: Record<string, string> = {}) {
    const config: Config = testConfig({ WATCHER_ENABLED: 'true', CONFIRMATIONS_REQUIRED: '3', ...overrides });
    return {
      config,
      watcher: new Watcher(pool, config, chain.asClient()),
      sessions: new SessionService(pool, config, fixedPriceService()),
      stateId: watcherStateId(config.chain.chainId, config.chain.usdcAddress),
    };
  }

  const status = async (id: string) => (await getSession(pool, id))?.status;

  it('settles a payment that lands after the session opens', async () => {
    const chain = new FakeChain(USDC, 20);
    const { watcher, sessions, stateId } = build(chain);

    await watcher.tick(); // cold start: bookmark at the current head
    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });

    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('confirming');

    chain.mine();
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('confirming');

    chain.mine();
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('paid');

    const state = await getWatcherState(pool, stateId);
    expect(state?.lastProcessedBlock).toBe(chain.head);
  });

  it('backfills payments that landed while the service was down', async () => {
    const chain = new FakeChain(USDC, 10);
    const { watcher, sessions } = build(chain);

    await watcher.tick();
    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });

    // The service is "down": blocks accumulate with no ticks at all.
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    for (let i = 0; i < 40; i += 1) chain.mine();

    // A fresh Watcher instance, as if the process restarted.
    const restarted = build(chain).watcher;
    await restarted.tick();

    expect(await status(session.sessionId)).toBe('paid');
  });

  it('starts from WATCHER_START_BLOCK on a cold start when one is configured', async () => {
    const chain = new FakeChain(USDC, 5);
    const { sessions } = build(chain);
    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });

    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    for (let i = 0; i < 5; i += 1) chain.mine();

    const { watcher } = build(chain, { WATCHER_START_BLOCK: '0' });
    await watcher.tick();

    expect(await status(session.sessionId)).toBe('paid');
  });

  it('ignores a transfer to an address that is not a merchant', async () => {
    const chain = new FakeChain(USDC, 5);
    const { watcher, sessions } = build(chain);
    await watcher.tick();

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    chain.mine([{ to: OTHER_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    await watcher.tick();

    expect(await status(session.sessionId)).toBe('pending');
    expect(await listUnmatchedPayments(pool)).toHaveLength(0);
  });

  it('re-scans its reorg window every tick without double-crediting', async () => {
    const chain = new FakeChain(USDC, 5);
    const { watcher, sessions } = build(chain, { REORG_DEPTH_BLOCKS: '12' });
    await watcher.tick();

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);

    for (let i = 0; i < 5; i += 1) await watcher.tick();

    const record = await getSession(pool, session.sessionId);
    expect(record?.receivedUsdc).toBe(BigInt(session.amountUsdcMicro));
    expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(1);
  });

  it('walks a session back to pending when its block is reorged away', async () => {
    const chain = new FakeChain(USDC, 5);
    const { watcher, sessions } = build(chain, { REORG_DEPTH_BLOCKS: '12', CONFIRMATIONS_REQUIRED: '5' });
    await watcher.tick();

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    const paidAt = chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    chain.mine();
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('confirming');

    // That block is replaced by a different one that does not contain the transfer.
    chain.reorgFrom(paidAt, [[], []]);
    await watcher.tick();

    const record = await getSession(pool, session.sessionId);
    expect(record?.status).toBe('pending');
    expect(record?.receivedUsdc).toBe(0n);
    expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(0);
  });

  it('re-settles when the transfer is re-included in the new chain', async () => {
    const chain = new FakeChain(USDC, 5);
    const { watcher, sessions } = build(chain, { REORG_DEPTH_BLOCKS: '12' });
    await watcher.tick();

    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });
    const value = BigInt(session.amountUsdcMicro);
    const txHash = `0x${'7'.repeat(64)}`;
    const paidAt = chain.mine([{ to: MERCHANT_ADDRESS, value, txHash }]);
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('confirming');

    // Same transaction, re-mined one block later in the new history.
    chain.reorgFrom(paidAt, [[], [{ to: MERCHANT_ADDRESS, value, txHash }]]);
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('confirming');

    chain.mine();
    chain.mine();
    await watcher.tick();
    expect(await status(session.sessionId)).toBe('paid');
    expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(1);
  });

  it('scans a long backlog in bounded chunks', async () => {
    const chain = new FakeChain(USDC, 2);
    const { sessions } = build(chain);
    const session = await sessions.createSession({ merchantId: 'demo', amountUsd: '45.00' });

    chain.mine([{ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }]);
    for (let i = 0; i < 100; i += 1) chain.mine();

    const { watcher } = build(chain, { WATCHER_START_BLOCK: '0', WATCHER_MAX_BLOCK_RANGE: '10' });
    chain.calls.getLogs = 0;
    await watcher.tick();

    expect(await status(session.sessionId)).toBe('paid');
    // ~104 blocks in chunks of 10.
    expect(chain.calls.getLogs).toBeGreaterThanOrEqual(10);
    expect(chain.calls.getLogs).toBeLessThanOrEqual(12);
  });

  it('reports its progress for the readiness endpoint', async () => {
    const chain = new FakeChain(USDC, 3);
    const { watcher } = build(chain);
    await watcher.tick();

    const status = watcher.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.headBlock).toBe(chain.head.toString());
    expect(status.lastError).toBeNull();
    expect(status.lastTickAt).not.toBeNull();
  });

  it('records the failure and keeps its bookmark when the RPC is down', async () => {
    const chain = new FakeChain(USDC, 3);
    const { watcher, stateId } = build(chain);
    await watcher.tick();
    const before = await getWatcherState(pool, stateId);

    const broken = chain.asClient();
    broken.getBlockNumber = async () => {
      throw new Error('RPC unavailable');
    };
    const failing = new Watcher(pool, testConfig({ WATCHER_ENABLED: 'true' }), broken);
    await failing.tick();

    expect(failing.getStatus().lastError).toBe('RPC unavailable');
    expect((await getWatcherState(pool, stateId))?.lastProcessedBlock).toBe(before?.lastProcessedBlock);
  });
});
