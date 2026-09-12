import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Config } from '../config.js';
import { listActivePaymentsForSession } from '../db/payments.js';
import type { Queryable } from '../db/pool.js';
import type { Merchant, Session, WebhookDelivery, WebhookEventType } from '../db/types.js';
import {
  claimDueDeliveries,
  enqueueWebhook,
  markAttemptFailed,
  markDelivered,
} from '../db/webhookDeliveries.js';
import { formatUsd, formatUsdc } from '../sessions/amounts.js';
import { logger } from '../logger.js';
import { DELIVERY_HEADER, EVENT_HEADER, TIMESTAMP_HEADER, SIGNATURE_HEADER, signatureHeaderValue } from './signature.js';

export interface WebhookPayload extends Record<string, unknown> {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  data: Record<string, unknown>;
}

/**
 * Builds and enqueues the merchant notification for a settled session.
 * No-ops for merchants without a webhook configured, and is idempotent per
 * (session, event) at the database level.
 */
export async function enqueueSessionWebhook(
  db: Queryable,
  chainId: number,
  usdcAddress: string,
  merchant: Merchant,
  session: Session,
  eventType: WebhookEventType,
): Promise<WebhookDelivery | null> {
  if (!merchant.webhookUrl || !merchant.webhookSecret) return null;

  const payments = await listActivePaymentsForSession(db, session.id);
  const deliveryId = randomUUID();

  const payload: WebhookPayload = {
    id: deliveryId,
    type: eventType,
    createdAt: new Date().toISOString(),
    data: {
      sessionId: session.id,
      merchantId: session.merchantId,
      orderRef: session.orderRef,
      status: session.status,
      amountUsd: formatUsd(session.amountUsdCents),
      amountUsdc: formatUsdc(session.amountUsdc),
      amountUsdcMicro: session.amountUsdc.toString(),
      receivedUsdc: formatUsdc(session.receivedUsdc),
      receivedUsdcMicro: session.receivedUsdc.toString(),
      payToAddress: session.payToAddress,
      chainId,
      token: { address: usdcAddress, symbol: 'USDC', decimals: 6 },
      transactions: payments.map((p) => ({
        txHash: p.txHash,
        logIndex: p.logIndex,
        blockNumber: p.blockNumber.toString(),
        amountUsdc: formatUsdc(p.amountUsdc),
        from: p.fromAddress,
      })),
    },
  };

  return enqueueWebhook(db, {
    id: deliveryId,
    merchantId: merchant.id,
    sessionId: session.id,
    eventType,
    url: merchant.webhookUrl,
    payload,
  });
}

/**
 * Exponential backoff: base * 2^attempts seconds, plus up to 20% jitter so a
 * merchant that just came back up is not hit by every retry at once.
 */
export function backoffSeconds(attempts: number, baseSeconds: number, random: () => number = Math.random): number {
  const exponential = baseSeconds * 2 ** attempts;
  const capped = Math.min(exponential, 3600);
  return Math.round(capped * (1 + random() * 0.2));
}

export interface DeliveryResult {
  deliveryId: string;
  outcome: 'delivered' | 'retry' | 'dead';
  statusCode: number | null;
  error?: string;
}

/**
 * Sends one delivery and records the outcome. A 2xx is success; anything else
 * (including a network error or timeout) is a failed attempt. After
 * `maxAttempts` the row becomes a dead letter and is never retried again.
 */
export async function attemptDelivery(
  db: Queryable,
  delivery: WebhookDelivery,
  secret: string,
  options: { timeoutMs: number; maxAttempts: number; backoffBaseSeconds: number },
): Promise<DeliveryResult> {
  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);

  let statusCode: number | null = null;
  let failure: string | null = null;

  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SIGNATURE_HEADER]: signatureHeaderValue(secret, timestamp, rawBody),
        [TIMESTAMP_HEADER]: String(timestamp),
        [EVENT_HEADER]: delivery.eventType,
        [DELIVERY_HEADER]: delivery.id,
        'user-agent': 'BasePay-Webhooks/1',
      },
      body: rawBody,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    statusCode = response.status;
    if (!response.ok) failure = `HTTP ${response.status}`;
  } catch (err) {
    failure = (err as Error).message || 'request failed';
  }

  if (failure === null) {
    await markDelivered(db, delivery.id, statusCode ?? 200);
    return { deliveryId: delivery.id, outcome: 'delivered', statusCode };
  }

  const updated = await markAttemptFailed(
    db,
    delivery.id,
    options.maxAttempts,
    backoffSeconds(delivery.attempts, options.backoffBaseSeconds),
    failure,
    statusCode,
  );
  return {
    deliveryId: delivery.id,
    outcome: updated?.status === 'dead' ? 'dead' : 'retry',
    statusCode,
    error: failure,
  };
}

/** Background worker draining the webhook_deliveries queue. */
export class WebhookWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly config: Config,
    private readonly secretLookup: (merchantId: string) => Promise<string | null>,
  ) {}

  start(): void {
    if (this.timer || !this.config.webhooks.enabled) return;
    this.stopped = false;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.webhooks.workerIntervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Let an in-flight tick finish so we do not leave a leased delivery behind.
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 25));
  }

  /** Exposed for tests: drain whatever is currently due, once. */
  async tick(): Promise<DeliveryResult[]> {
    if (this.running || this.stopped) return [];
    this.running = true;
    try {
      const leaseSeconds = Math.max(30, Math.ceil(this.config.webhooks.timeoutMs / 1000) * 2);
      const due = await claimDueDeliveries(this.pool, 20, leaseSeconds);
      const results: DeliveryResult[] = [];
      for (const delivery of due) {
        const secret = await this.secretLookup(delivery.merchantId);
        if (!secret) {
          logger.warn({ deliveryId: delivery.id }, 'webhook secret missing; dropping delivery');
          await markAttemptFailed(
            this.pool,
            delivery.id,
            1,
            this.config.webhooks.backoffBaseSeconds,
            'merchant webhook secret is not configured',
            null,
          );
          continue;
        }
        const result = await attemptDelivery(this.pool, delivery, secret, {
          timeoutMs: this.config.webhooks.timeoutMs,
          maxAttempts: this.config.webhooks.maxAttempts,
          backoffBaseSeconds: this.config.webhooks.backoffBaseSeconds,
        });
        results.push(result);
        const log = result.outcome === 'delivered' ? logger.info.bind(logger) : logger.warn.bind(logger);
        log({ ...result, url: delivery.url, event: delivery.eventType }, `webhook ${result.outcome}`);
      }
      return results;
    } catch (err) {
      logger.error({ err }, 'webhook worker tick failed');
      return [];
    } finally {
      this.running = false;
    }
  }
}
