import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { listActivePaymentsForSession, listUnmatchedPayments } from '../../src/db/payments.js';
import { expirePendingSessions, getSession } from '../../src/db/sessions.js';
import { listDeliveriesForSession } from '../../src/db/webhookDeliveries.js';
import { SessionService } from '../../src/sessions/sessionService.js';
import { Settlement } from '../../src/watcher/settlement.js';
import { createTestPool, hasDatabase, resetDatabase } from '../helpers/db.js';
import { fixedPriceService, MERCHANT_ADDRESS, seedMerchant, testConfig, transfer } from '../helpers/fixtures.js';

const WEBHOOK = { webhookUrl: 'https://merchant.example/hooks/basepay', webhookSecret: 'whsec_test_secret_value_123' };

describe.skipIf(!hasDatabase)('settlement state machine', () => {
  let pool: pg.Pool;
  let config: Config;
  let settlement: Settlement;
  let sessions: SessionService;

  beforeAll(async () => {
    pool = await createTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await seedMerchant(pool, WEBHOOK);
    config = testConfig({ CONFIRMATIONS_REQUIRED: '3' });
    settlement = new Settlement(pool, config);
    sessions = new SessionService(pool, config, fixedPriceService());
  });

  const open = (amountUsd = '45.00') => sessions.createSession({ merchantId: 'demo', amountUsd, orderRef: 'ORDER-1' });
  const status = async (id: string) => (await getSession(pool, id))?.status;

  it('walks an exact payment from pending to confirming to paid', async () => {
    const session = await open();
    expect(session.status).toBe('pending');

    const outcome = await settlement.applyTransfer(
      transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro), blockNumber: 100n }),
    );
    expect(outcome.kind).toBe('confirming');

    let record = await getSession(pool, session.sessionId);
    expect(record?.status).toBe('confirming');
    expect(record?.confirmations).toBe(1);
    expect(record?.receivedUsdc).toBe(BigInt(session.amountUsdcMicro));
    expect(record?.firstSeenAt).not.toBeNull();

    // Two confirmations is not enough.
    await settlement.advanceConfirmations(101n);
    record = await getSession(pool, session.sessionId);
    expect(record?.status).toBe('confirming');
    expect(record?.confirmations).toBe(2);

    await settlement.advanceConfirmations(102n);
    record = await getSession(pool, session.sessionId);
    expect(record?.status).toBe('paid');
    expect(record?.confirmations).toBe(3);
    expect(record?.settledAt).not.toBeNull();
  });

  it('queues exactly one paid webhook, however many times settlement runs', async () => {
    const session = await open();
    await settlement.applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }));

    await settlement.advanceConfirmations(102n);
    await settlement.advanceConfirmations(103n);
    await settlement.advanceConfirmations(104n);

    const deliveries = await listDeliveriesForSession(pool, session.sessionId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.eventType).toBe('payment.paid');
    expect(deliveries[0]?.url).toBe(WEBHOOK.webhookUrl);
    expect(deliveries[0]?.payload).toMatchObject({
      type: 'payment.paid',
      data: { orderRef: 'ORDER-1', amountUsd: '45.00', status: 'paid' },
    });
  });

  it('counts a replayed log once, so a re-scan cannot double-credit a session', async () => {
    const session = await open();
    const log = transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) });

    expect((await settlement.applyTransfer(log)).kind).toBe('confirming');
    expect((await settlement.applyTransfer(log)).kind).toBe('noop');
    expect((await settlement.applyTransfer(log)).kind).toBe('noop');

    const record = await getSession(pool, session.sessionId);
    expect(record?.receivedUsdc).toBe(BigInt(session.amountUsdcMicro));
    expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(1);
  });

  it('never moves an attributed transfer onto a session that later takes the same amount', async () => {
    // Session A is quoted an amount and its payment is seen.
    const first = await open();
    const log = transfer({ to: MERCHANT_ADDRESS, value: BigInt(first.amountUsdcMicro), blockNumber: 100n });
    await settlement.applyTransfer(log);
    expect(await status(first.sessionId)).toBe('confirming');

    // A is abandoned and its amount slot is released...
    await pool.query(`UPDATE sessions SET status = 'expired', settled_at = now() WHERE id = $1`, [first.sessionId]);
    // ...and session B is quoted exactly the same amount.
    const second = await open();
    expect(second.amountUsdcMicro).toBe(first.amountUsdcMicro);

    // The watcher re-scans its window and sees the same log again.
    const outcome = await settlement.applyTransfer(log);
    expect(outcome).toEqual({ kind: 'already-attributed', sessionId: first.sessionId });

    // B did not settle on A's money, and did not get stranded mid-transition.
    const record = await getSession(pool, second.sessionId);
    expect(record?.status).toBe('pending');
    expect(record?.receivedUsdc).toBe(0n);
    expect(await listActivePaymentsForSession(pool, second.sessionId)).toHaveLength(0);
  });

  it('does not let a stray unmatched transfer settle a later session quoted the same amount', async () => {
    // Money arrives with no open session to attribute it to.
    const stray = transfer({ to: MERCHANT_ADDRESS, value: 45_000_000n, blockNumber: 100n });
    expect((await settlement.applyTransfer(stray)).kind).toBe('unmatched');

    // A session is then opened for exactly that amount.
    const session = await open();
    expect(session.amountUsdcMicro).toBe('45000000');

    const outcome = await settlement.applyTransfer(stray);
    expect(outcome).toEqual({ kind: 'already-attributed', sessionId: null });
    expect(await status(session.sessionId)).toBe('pending');
  });

  it('attributes concurrent payments to the right sessions by amount alone', async () => {
    const a = await open('45.00');
    const b = await open('45.00');
    expect(a.amountUsdcMicro).not.toBe(b.amountUsdcMicro);

    await settlement.applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: BigInt(b.amountUsdcMicro) }));

    expect(await status(a.sessionId)).toBe('pending');
    expect(await status(b.sessionId)).toBe('confirming');
  });

  it('marks a short payment underpaid, records what arrived, and refunds nothing', async () => {
    const session = await open();
    const arrived = BigInt(session.amountUsdcMicro) - 5_000_000n;

    const outcome = await settlement.applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: arrived }));
    expect(outcome.kind).toBe('underpaid');

    const record = await getSession(pool, session.sessionId);
    expect(record?.status).toBe('underpaid');
    expect(record?.receivedUsdc).toBe(arrived);
    expect(record?.settledAt).not.toBeNull();

    const deliveries = await listDeliveriesForSession(pool, session.sessionId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.eventType).toBe('payment.underpaid');
    expect(deliveries[0]?.payload).toMatchObject({
      data: { receivedUsdc: '40.000000', amountUsdc: '45.000000' },
    });
  });

  it('settles an overpayment inside the tolerance, which is how the on-ramp path lands', async () => {
    const session = await open();
    const arrived = BigInt(session.amountUsdcMicro) + 1_230_000n;

    expect((await settlement.applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: arrived }))).kind).toBe('confirming');
    await settlement.advanceConfirmations(102n);

    const record = await getSession(pool, session.sessionId);
    expect(record?.status).toBe('paid');
    expect(record?.receivedUsdc).toBe(arrived);
  });

  it('leaves money unattributed rather than guessing between two candidates', async () => {
    const a = await open('45.00');
    await open('45.00');

    // Close to both quotes: no exact match, and both are within tolerance.
    const outcome = await settlement.applyTransfer(
      transfer({ to: MERCHANT_ADDRESS, value: BigInt(a.amountUsdcMicro) + 500_000n }),
    );
    expect(outcome).toMatchObject({ kind: 'unmatched', reason: 'ambiguous' });

    const unmatched = await listUnmatchedPayments(pool);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.amountUsdc).toBe(BigInt(a.amountUsdcMicro) + 500_000n);
  });

  it('records an unrelated transfer to the merchant address without touching sessions', async () => {
    const session = await open();
    await settlement.applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: 1_000_000n }));

    expect(await status(session.sessionId)).toBe('pending');
    expect(await listUnmatchedPayments(pool)).toHaveLength(1);
  });

  it('does not attribute a late payment to an expired session', async () => {
    const session = await open();
    await pool.query(`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = $1`, [session.sessionId]);
    await expirePendingSessions(pool);
    expect(await status(session.sessionId)).toBe('expired');

    const outcome = await settlement.applyTransfer(
      transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }),
    );
    expect(outcome).toMatchObject({ kind: 'unmatched', reason: 'no-candidates' });
    expect(await status(session.sessionId)).toBe('expired');
    expect(await listUnmatchedPayments(pool)).toHaveLength(1);
  });

  describe('reorgs', () => {
    it('walks a confirming session back to pending when its transfer disappears', async () => {
      const session = await open();
      await settlement.applyTransfer(
        transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro), blockNumber: 100n, blockHash: `0x${'aa'.repeat(32)}` }),
      );
      expect(await status(session.sessionId)).toBe('confirming');

      // The chain now reports a different hash at block 100.
      const orphaned = await settlement.revalidateFromBlock(95n, async () => `0x${'bb'.repeat(32)}`);
      expect(orphaned).toBe(1);

      const record = await getSession(pool, session.sessionId);
      expect(record?.status).toBe('pending');
      expect(record?.receivedUsdc).toBe(0n);
      expect(record?.confirmations).toBe(0);
      expect(record?.firstSeenAt).toBeNull();
      expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(0);
    });

    it('re-confirms the session when the transfer is re-included in a new block', async () => {
      const session = await open();
      const log = transfer({
        to: MERCHANT_ADDRESS,
        value: BigInt(session.amountUsdcMicro),
        blockNumber: 100n,
        blockHash: `0x${'aa'.repeat(32)}`,
      });
      await settlement.applyTransfer(log);
      await settlement.revalidateFromBlock(95n, async () => `0x${'bb'.repeat(32)}`);
      expect(await status(session.sessionId)).toBe('pending');

      // Same transaction, new block.
      await settlement.applyTransfer({ ...log, blockNumber: 101n, blockHash: `0x${'cc'.repeat(32)}` });

      const record = await getSession(pool, session.sessionId);
      expect(record?.status).toBe('confirming');
      expect(record?.receivedUsdc).toBe(BigInt(session.amountUsdcMicro));
      expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(1);
    });

    it('does not orphan anything when the RPC cannot answer', async () => {
      const session = await open();
      await settlement.applyTransfer(transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro) }));

      const orphaned = await settlement.revalidateFromBlock(0n, async () => null);
      expect(orphaned).toBe(0);
      expect(await status(session.sessionId)).toBe('confirming');
    });

    it('leaves the block hash alone when it still matches', async () => {
      const session = await open();
      const hash = `0x${'dd'.repeat(32)}`;
      await settlement.applyTransfer(
        transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro), blockHash: hash }),
      );

      expect(await settlement.revalidateFromBlock(0n, async () => hash.toUpperCase())).toBe(0);
      expect(await status(session.sessionId)).toBe('confirming');
    });

    it('never un-pays a settled session, but flags it for reconciliation', async () => {
      const session = await open();
      await settlement.applyTransfer(
        transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro), blockNumber: 100n }),
      );
      await settlement.advanceConfirmations(102n);
      expect(await status(session.sessionId)).toBe('paid');

      await settlement.revalidateFromBlock(95n, async () => `0x${'ee'.repeat(32)}`);

      // The merchant was already told. The payment row records the truth.
      expect(await status(session.sessionId)).toBe('paid');
      expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(0);
    });

    it('keeps the session confirming when a reorg removes only a duplicate transfer', async () => {
      const session = await open();
      // A buyer who pays twice: two exact-amount transfers, both attributed.
      await settlement.applyTransfer(
        transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro), blockNumber: 100n, blockHash: `0x${'11'.repeat(32)}` }),
      );
      await settlement.applyTransfer(
        transfer({ to: MERCHANT_ADDRESS, value: BigInt(session.amountUsdcMicro), blockNumber: 101n, blockHash: `0x${'22'.repeat(32)}` }),
      );
      expect(await listActivePaymentsForSession(pool, session.sessionId)).toHaveLength(2);

      await settlement.revalidateFromBlock(101n, async () => `0x${'33'.repeat(32)}`);

      const record = await getSession(pool, session.sessionId);
      expect(record?.status).toBe('confirming');
      expect(record?.receivedUsdc).toBe(BigInt(session.amountUsdcMicro));
    });
  });
});
