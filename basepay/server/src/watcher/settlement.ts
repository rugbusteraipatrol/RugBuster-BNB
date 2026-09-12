import type pg from 'pg';
import type { Config } from '../config.js';
import { getMerchant } from '../db/merchants.js';
import {
  listActivePaymentsForSession,
  listActivePaymentsFromBlock,
  orphanPayment,
  recordPayment,
  sumActivePayments,
} from '../db/payments.js';
import { withTransaction, type Queryable } from '../db/pool.js';
import {
  getSession,
  listConfirmingSessions,
  listOpenSessionsForAddressInRange,
  updateConfirmations,
  updateReceivedAmount,
  updateSessionStatus,
} from '../db/sessions.js';
import type { PaymentMatchKind, Session, WebhookEventType } from '../db/types.js';
import { logger } from '../logger.js';
import { formatUsdc } from '../sessions/amounts.js';
import { matchTransfer, quoteWindow, ratioToScaled, type MatchOptions } from '../sessions/matching.js';
import { sourcesFor } from '../sessions/stateMachine.js';
import { enqueueSessionWebhook } from '../webhooks/dispatcher.js';

export interface ObservedTransfer {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  from: string;
  to: string;
  value: bigint;
}

export type SettlementOutcome =
  | { kind: 'already-attributed'; sessionId: string | null }
  | { kind: 'unmatched'; reason: 'no-candidates' | 'ambiguous' }
  | { kind: 'confirming'; sessionId: string; matchKind: PaymentMatchKind }
  | { kind: 'underpaid'; sessionId: string }
  | { kind: 'noop'; sessionId: string; matchKind: PaymentMatchKind };

/**
 * Everything that happens to a session as a consequence of chain state.
 * Separated from the block-scanning loop so it can be driven directly by tests
 * with synthetic transfers, without an RPC in the picture.
 */
export class Settlement {
  private readonly matchOptions: MatchOptions;

  constructor(
    private readonly pool: pg.Pool,
    private readonly config: Config,
  ) {
    this.matchOptions = {
      underpayMinRatioScaled: ratioToScaled(config.sessions.underpayMinRatio),
      overpayMaxRatioScaled: ratioToScaled(config.sessions.overpayMaxRatio),
    };
  }

  /**
   * Records an observed transfer and applies it to a session if it can be
   * attributed. Runs in one transaction: a transfer is never recorded without
   * the session change it implies, and vice versa.
   */
  async applyTransfer(transfer: ObservedTransfer): Promise<SettlementOutcome> {
    const { outcome, webhookQueued } = await withTransaction(this.pool, async (tx) => {
      const toLower = transfer.to.toLowerCase();
      const window = quoteWindow(transfer.value, this.matchOptions);
      const candidateSessions = await listOpenSessionsForAddressInRange(
        tx,
        toLower,
        window.minQuote,
        window.maxQuote,
      );

      const result = matchTransfer(
        transfer.value,
        candidateSessions.map((s) => ({
          id: s.id,
          amountUsdc: s.amountUsdc,
          toleranceEligible: s.status === 'pending',
        })),
        this.matchOptions,
      );

      const matchKind: PaymentMatchKind = result.kind === 'unmatched' ? 'unmatched' : result.kind;
      const sessionId = result.kind === 'unmatched' ? null : result.session.id;

      const { payment, inserted } = await recordPayment(tx, {
        txHash: transfer.txHash,
        logIndex: transfer.logIndex,
        blockNumber: transfer.blockNumber,
        blockHash: transfer.blockHash,
        fromAddress: transfer.from,
        toAddress: transfer.to,
        amountUsdc: transfer.value,
        sessionId,
        matchKind,
      });

      // A transfer is attributed exactly once, to the first session that matched
      // it. Re-attribution looks harmless but is not: a transfer re-included after
      // a reorg could be moved onto whichever session has since taken that amount
      // slot, and a stray unmatched transfer could silently settle a brand new
      // session quoted the same amount. Neither is money we are entitled to move.
      if (!inserted && payment.sessionId !== sessionId) {
        logger.warn(
          {
            txHash: transfer.txHash,
            logIndex: transfer.logIndex,
            attributedTo: payment.sessionId,
            wouldHaveMatched: sessionId,
          },
          'transfer is already attributed; leaving both sessions alone',
        );
        return {
          outcome: { kind: 'already-attributed' as const, sessionId: payment.sessionId },
          webhookQueued: false,
        };
      }

      if (sessionId === null) {
        if (inserted) {
          logger.warn(
            {
              txHash: transfer.txHash,
              to: transfer.to,
              amountUsdc: formatUsdc(transfer.value),
              reason: result.kind === 'unmatched' ? result.reason : 'unknown',
            },
            'USDC transfer to a merchant address could not be attributed to a session',
          );
        }
        return {
          outcome: {
            kind: 'unmatched' as const,
            reason: result.kind === 'unmatched' ? result.reason : ('no-candidates' as const),
          },
          webhookQueued: false,
        };
      }

      const session = candidateSessions.find((s) => s.id === sessionId);
      if (!session) throw new Error(`matched session ${sessionId} vanished mid-transaction`);

      const received = await sumActivePayments(tx, sessionId);

      if (result.kind === 'exact' || result.kind === 'overpaid') {
        const updated = await updateSessionStatus(tx, sessionId, sourcesFor('confirming'), 'confirming', {
          receivedUsdc: received,
          confirmations: 1,
          firstSeenAt: session.firstSeenAt ?? new Date(),
        });
        if (!updated) {
          // Already confirming (a second exact-amount transfer, or a replay).
          await updateReceivedAmount(tx, sessionId, received);
          return { outcome: { kind: 'noop' as const, sessionId, matchKind }, webhookQueued: false };
        }
        return { outcome: { kind: 'confirming' as const, sessionId, matchKind }, webhookQueued: false };
      }

      // Underpaid. Terminal, and never auto-refunded: the funds are already in the
      // merchant's wallet and this service holds no key that could move them.
      const updated = await updateSessionStatus(tx, sessionId, sourcesFor('underpaid'), 'underpaid', {
        receivedUsdc: received,
        firstSeenAt: session.firstSeenAt ?? new Date(),
        settledAt: new Date(),
      });
      if (!updated) {
        await updateReceivedAmount(tx, sessionId, received);
        return { outcome: { kind: 'noop' as const, sessionId, matchKind }, webhookQueued: false };
      }
      const webhookQueued = await this.enqueue(tx, updated, 'payment.underpaid');
      return { outcome: { kind: 'underpaid' as const, sessionId }, webhookQueued };
    });

    if (outcome.kind === 'underpaid') {
      logger.warn({ sessionId: outcome.sessionId, webhookQueued }, 'session underpaid');
    }
    return outcome;
  }

  /**
   * Promotes `confirming` sessions to `paid` once their latest transfer has the
   * required depth, and reverts sessions whose transfers were all reorged away.
   */
  async advanceConfirmations(headBlock: bigint): Promise<void> {
    const required = this.config.watcher.confirmationsRequired;
    for (const session of await listConfirmingSessions(this.pool)) {
      const payments = await listActivePaymentsForSession(this.pool, session.id);

      if (payments.length === 0) {
        await this.revertToPending(session);
        continue;
      }

      const latestBlock = payments.reduce((max, p) => (p.blockNumber > max ? p.blockNumber : max), 0n);
      const received = payments.reduce((sum, p) => sum + p.amountUsdc, 0n);
      const confirmations = headBlock >= latestBlock ? Number(headBlock - latestBlock + 1n) : 0;

      if (confirmations >= required && received >= session.amountUsdc) {
        await this.markPaid(session.id, received, confirmations);
      } else {
        await updateConfirmations(this.pool, session.id, confirmations);
      }
    }
  }

  /**
   * Re-checks that transfers recorded at or above `fromBlock` are still in the
   * canonical chain. `blockHashAt` returns null when the RPC could not answer —
   * we skip rather than orphan, because an RPC hiccup must never look like a reorg.
   */
  async revalidateFromBlock(
    fromBlock: bigint,
    blockHashAt: (blockNumber: bigint) => Promise<string | null>,
  ): Promise<number> {
    const payments = await listActivePaymentsFromBlock(this.pool, fromBlock);
    if (payments.length === 0) return 0;

    const hashes = new Map<bigint, string | null>();
    let orphaned = 0;

    for (const payment of payments) {
      if (!hashes.has(payment.blockNumber)) {
        hashes.set(payment.blockNumber, await blockHashAt(payment.blockNumber));
      }
      const canonical = hashes.get(payment.blockNumber) ?? null;
      if (canonical === null) continue;
      if (canonical.toLowerCase() === payment.blockHash.toLowerCase()) continue;

      const removed = await orphanPayment(this.pool, payment.id);
      if (!removed) continue;
      orphaned += 1;
      logger.warn(
        {
          txHash: payment.txHash,
          blockNumber: payment.blockNumber.toString(),
          recordedBlockHash: payment.blockHash,
          canonicalBlockHash: canonical,
          sessionId: payment.sessionId,
        },
        'transfer is no longer in the canonical chain; orphaned',
      );

      if (payment.sessionId) await this.handleOrphanedSessionPayment(payment.sessionId);
    }

    return orphaned;
  }

  private async handleOrphanedSessionPayment(sessionId: string): Promise<void> {
    const session = await getSession(this.pool, sessionId);
    if (!session) return;
    const received = await sumActivePayments(this.pool, sessionId);

    if (session.status === 'confirming') {
      if (received === 0n) {
        await this.revertToPending(session);
      } else {
        await updateReceivedAmount(this.pool, sessionId, received);
      }
      return;
    }

    if (session.status === 'paid' || session.status === 'underpaid') {
      // Deeper than our confirmation depth. We do not un-settle a session the
      // merchant has already been told about; we make the operator aware instead.
      logger.error(
        {
          sessionId,
          status: session.status,
          quotedUsdc: formatUsdc(session.amountUsdc),
          stillReceivedUsdc: formatUsdc(received),
        },
        'reorg affected an already-settled session; manual reconciliation required',
      );
    }
  }

  private async revertToPending(session: Session): Promise<void> {
    const reverted = await updateSessionStatus(this.pool, session.id, ['confirming'], 'pending', {
      receivedUsdc: 0n,
      confirmations: 0,
      firstSeenAt: null,
    });
    if (reverted) {
      logger.warn({ sessionId: session.id }, 'session reverted to pending: matched transfer disappeared');
    }
  }

  private async markPaid(sessionId: string, received: bigint, confirmations: number): Promise<void> {
    const result = await withTransaction(this.pool, async (tx) => {
      const paid = await updateSessionStatus(tx, sessionId, sourcesFor('paid'), 'paid', {
        receivedUsdc: received,
        confirmations,
        settledAt: new Date(),
      });
      if (!paid) return null;
      return { webhookQueued: await this.enqueue(tx, paid, 'payment.paid') };
    });

    if (result) {
      logger.info(
        { sessionId, confirmations, receivedUsdc: formatUsdc(received), webhookQueued: result.webhookQueued },
        'session paid',
      );
    }
  }

  /** Returns true when a delivery row was queued (merchant has a webhook configured). */
  private async enqueue(tx: Queryable, session: Session, eventType: WebhookEventType): Promise<boolean> {
    const merchant = await getMerchant(tx, session.merchantId);
    if (!merchant) return false;
    const delivery = await enqueueSessionWebhook(
      tx,
      this.config.chain.chainId,
      this.config.chain.usdcAddress,
      merchant,
      session,
      eventType,
    );
    return delivery !== null;
  }
}
