import type { Queryable } from './pool.js';
import type { WebhookDelivery, WebhookEventType, WebhookStatus } from './types.js';

interface WebhookRow {
  id: string;
  merchant_id: string;
  session_id: string | null;
  event_type: WebhookEventType;
  url: string;
  payload: Record<string, unknown>;
  status: WebhookStatus;
  attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  last_status_code: number | null;
  created_at: Date;
  updated_at: Date;
  delivered_at: Date | null;
}

const COLUMNS = `id, merchant_id, session_id, event_type, url, payload, status, attempts,
  next_attempt_at, last_error, last_status_code, created_at, updated_at, delivered_at`;

const toDelivery = (row: WebhookRow): WebhookDelivery => ({
  id: row.id,
  merchantId: row.merchant_id,
  sessionId: row.session_id,
  eventType: row.event_type,
  url: row.url,
  payload: row.payload,
  status: row.status,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at,
  lastError: row.last_error,
  lastStatusCode: row.last_status_code,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deliveredAt: row.delivered_at,
});

export interface EnqueueWebhookInput {
  id: string;
  merchantId: string;
  sessionId: string;
  eventType: WebhookEventType;
  url: string;
  payload: Record<string, unknown>;
}

/**
 * Enqueues a delivery. Idempotent per (session, event) via a partial unique index,
 * so a replayed settlement cannot notify the merchant twice.
 * Returns null when a delivery for this event already exists.
 */
export async function enqueueWebhook(db: Queryable, input: EnqueueWebhookInput): Promise<WebhookDelivery | null> {
  const { rows } = await db.query<WebhookRow>(
    `INSERT INTO webhook_deliveries (id, merchant_id, session_id, event_type, url, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (session_id, event_type) WHERE session_id IS NOT NULL DO NOTHING
     RETURNING ${COLUMNS}`,
    [input.id, input.merchantId, input.sessionId, input.eventType, input.url, JSON.stringify(input.payload)],
  );
  return rows[0] ? toDelivery(rows[0]) : null;
}

/**
 * Atomically claims due deliveries. `FOR UPDATE SKIP LOCKED` plus a pushed-out
 * next_attempt_at means two workers never send the same webhook concurrently.
 */
export async function claimDueDeliveries(
  db: Queryable,
  limit: number,
  leaseSeconds: number,
): Promise<WebhookDelivery[]> {
  const { rows } = await db.query<WebhookRow>(
    `UPDATE webhook_deliveries
        SET next_attempt_at = now() + make_interval(secs => $2::double precision),
            updated_at = now()
      WHERE id IN (
        SELECT id FROM webhook_deliveries
         WHERE status = 'pending' AND next_attempt_at <= now()
         ORDER BY next_attempt_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING ${COLUMNS}`,
    [limit, leaseSeconds],
  );
  return rows.map(toDelivery);
}

export async function markDelivered(db: Queryable, id: string, statusCode: number): Promise<void> {
  await db.query(
    `UPDATE webhook_deliveries
        SET status = 'delivered', attempts = attempts + 1, last_status_code = $2,
            last_error = NULL, delivered_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [id, statusCode],
  );
}

export async function markAttemptFailed(
  db: Queryable,
  id: string,
  maxAttempts: number,
  backoffSeconds: number,
  error: string,
  statusCode: number | null,
): Promise<WebhookDelivery | null> {
  const { rows } = await db.query<WebhookRow>(
    `UPDATE webhook_deliveries
        SET attempts = attempts + 1,
            last_error = $4,
            last_status_code = $5,
            status = CASE WHEN attempts + 1 >= $2 THEN 'dead' ELSE 'pending' END,
            next_attempt_at = now() + make_interval(secs => $3::double precision),
            updated_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING ${COLUMNS}`,
    [id, maxAttempts, backoffSeconds, error.slice(0, 2000), statusCode],
  );
  return rows[0] ? toDelivery(rows[0]) : null;
}

export async function listDeliveriesForSession(db: Queryable, sessionId: string): Promise<WebhookDelivery[]> {
  const { rows } = await db.query<WebhookRow>(
    `SELECT ${COLUMNS} FROM webhook_deliveries WHERE session_id = $1 ORDER BY created_at`,
    [sessionId],
  );
  return rows.map(toDelivery);
}

export async function listDeadLetters(db: Queryable, limit = 100): Promise<WebhookDelivery[]> {
  const { rows } = await db.query<WebhookRow>(
    `SELECT ${COLUMNS} FROM webhook_deliveries WHERE status = 'dead' ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toDelivery);
}
