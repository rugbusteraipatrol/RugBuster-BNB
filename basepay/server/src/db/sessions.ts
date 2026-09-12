import type { Queryable } from './pool.js';
import type { Session, SessionStatus } from './types.js';

interface SessionRow {
  id: string;
  merchant_id: string;
  order_ref: string | null;
  status: SessionStatus;
  amount_usd_cents: string;
  usdc_price_usd: string;
  price_stale: boolean;
  base_amount_usdc: string;
  amount_offset: number;
  amount_usdc: string;
  pay_to_address: string;
  received_usdc: string;
  confirmations: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  first_seen_at: Date | null;
  settled_at: Date | null;
}

const COLUMNS = `id, merchant_id, order_ref, status, amount_usd_cents, usdc_price_usd, price_stale,
  base_amount_usdc, amount_offset, amount_usdc, pay_to_address, received_usdc, confirmations,
  created_at, updated_at, expires_at, first_seen_at, settled_at`;

const toSession = (row: SessionRow): Session => ({
  id: row.id,
  merchantId: row.merchant_id,
  orderRef: row.order_ref,
  status: row.status,
  amountUsdCents: BigInt(row.amount_usd_cents),
  usdcPriceUsd: row.usdc_price_usd,
  priceStale: row.price_stale,
  baseAmountUsdc: BigInt(row.base_amount_usdc),
  amountOffset: row.amount_offset,
  amountUsdc: BigInt(row.amount_usdc),
  payToAddress: row.pay_to_address,
  receivedUsdc: BigInt(row.received_usdc),
  confirmations: row.confirmations,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  firstSeenAt: row.first_seen_at,
  settledAt: row.settled_at,
});

export interface InsertSessionInput {
  id: string;
  merchantId: string;
  orderRef: string | null;
  amountUsdCents: bigint;
  usdcPriceUsd: string;
  priceStale: boolean;
  baseAmountUsdc: bigint;
  amountOffset: number;
  payToAddress: string;
  expiresAt: Date;
}

/**
 * Inserts a `pending` session. Throws a unique violation on
 * `sessions_open_amount_uniq` if another open session already holds this exact
 * amount for this merchant — that is the reservation, and the caller retries.
 */
export async function insertSession(db: Queryable, input: InsertSessionInput): Promise<Session> {
  const amountUsdc = input.baseAmountUsdc + BigInt(input.amountOffset);
  const { rows } = await db.query<SessionRow>(
    `INSERT INTO sessions (id, merchant_id, order_ref, status, amount_usd_cents, usdc_price_usd,
        price_stale, base_amount_usdc, amount_offset, amount_usdc, pay_to_address, expires_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${COLUMNS}`,
    [
      input.id,
      input.merchantId,
      input.orderRef,
      input.amountUsdCents.toString(),
      input.usdcPriceUsd,
      input.priceStale,
      input.baseAmountUsdc.toString(),
      input.amountOffset,
      amountUsdc.toString(),
      input.payToAddress,
      input.expiresAt,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('insertSession returned no row');
  return toSession(row);
}

export async function getSession(db: Queryable, id: string): Promise<Session | null> {
  const { rows } = await db.query<SessionRow>(`SELECT ${COLUMNS} FROM sessions WHERE id = $1`, [id]);
  return rows[0] ? toSession(rows[0]) : null;
}

/**
 * Amounts already reserved by open sessions of this merchant inside
 * [lowInclusive, highExclusive). Used to pick the next free offset.
 */
export async function takenAmountsInRange(
  db: Queryable,
  merchantId: string,
  lowInclusive: bigint,
  highExclusive: bigint,
): Promise<Set<bigint>> {
  const { rows } = await db.query<{ amount_usdc: string }>(
    `SELECT amount_usdc FROM sessions
      WHERE merchant_id = $1
        AND status IN ('pending', 'confirming')
        AND amount_usdc >= $2
        AND amount_usdc < $3`,
    [merchantId, lowInclusive.toString(), highExclusive.toString()],
  );
  return new Set(rows.map((r) => BigInt(r.amount_usdc)));
}

/** The open session for this address holding exactly `amount`, if any. */
export async function findOpenSessionByAmount(
  db: Queryable,
  addressLower: string,
  amount: bigint,
): Promise<Session | null> {
  const { rows } = await db.query<SessionRow>(
    `SELECT ${COLUMNS} FROM sessions
      WHERE lower(pay_to_address) = $1
        AND amount_usdc = $2
        AND status IN ('pending', 'confirming')
      ORDER BY created_at
      LIMIT 1`,
    [addressLower, amount.toString()],
  );
  return rows[0] ? toSession(rows[0]) : null;
}

/**
 * Open sessions for this address whose quote falls inside [minQuote, maxQuote].
 * The window is computed from the observed transfer value; the decision about
 * which (if any) of these the transfer belongs to is made by the pure matcher in
 * `sessions/matching.ts`.
 */
export async function listOpenSessionsForAddressInRange(
  db: Queryable,
  addressLower: string,
  minQuote: bigint,
  maxQuote: bigint,
): Promise<Session[]> {
  const { rows } = await db.query<SessionRow>(
    `SELECT ${COLUMNS} FROM sessions
      WHERE lower(pay_to_address) = $1
        AND status IN ('pending', 'confirming')
        AND amount_usdc >= $2
        AND amount_usdc <= $3
      ORDER BY amount_usdc ASC, created_at ASC`,
    [addressLower, minQuote.toString(), maxQuote.toString()],
  );
  return rows.map(toSession);
}

export interface StatusUpdate {
  receivedUsdc?: bigint;
  confirmations?: number;
  firstSeenAt?: Date | null;
  settledAt?: Date | null;
}

/**
 * Moves a session to `to` only if it is currently in one of `from`. Returns null
 * when the row moved underneath us, which the callers treat as "someone else
 * already handled this" rather than an error.
 */
export async function updateSessionStatus(
  db: Queryable,
  id: string,
  from: readonly SessionStatus[],
  to: SessionStatus,
  update: StatusUpdate = {},
): Promise<Session | null> {
  const sets: string[] = ['status = $3', 'updated_at = now()'];
  const params: unknown[] = [id, from as unknown as string[], to];

  if (update.receivedUsdc !== undefined) {
    params.push(update.receivedUsdc.toString());
    sets.push(`received_usdc = $${params.length}`);
  }
  if (update.confirmations !== undefined) {
    params.push(update.confirmations);
    sets.push(`confirmations = $${params.length}`);
  }
  if (update.firstSeenAt !== undefined) {
    params.push(update.firstSeenAt);
    sets.push(`first_seen_at = $${params.length}`);
  }
  if (update.settledAt !== undefined) {
    params.push(update.settledAt);
    sets.push(`settled_at = $${params.length}`);
  }

  const { rows } = await db.query<SessionRow>(
    `UPDATE sessions SET ${sets.join(', ')}
      WHERE id = $1 AND status = ANY($2::text[])
      RETURNING ${COLUMNS}`,
    params,
  );
  return rows[0] ? toSession(rows[0]) : null;
}

/** Refreshes the received total without touching status. Open sessions only. */
export async function updateReceivedAmount(db: Queryable, id: string, receivedUsdc: bigint): Promise<void> {
  await db.query(
    `UPDATE sessions SET received_usdc = $2, updated_at = now()
      WHERE id = $1 AND status IN ('pending', 'confirming')`,
    [id, receivedUsdc.toString()],
  );
}

/** Cheap progress update that must not change status. */
export async function updateConfirmations(db: Queryable, id: string, confirmations: number): Promise<void> {
  await db.query(
    `UPDATE sessions SET confirmations = $2, updated_at = now()
      WHERE id = $1 AND status = 'confirming' AND confirmations <> $2`,
    [id, confirmations],
  );
}

/**
 * Expires pending sessions past their deadline, releasing their reserved amounts.
 * `confirming` sessions are deliberately excluded: money is already on the way.
 */
export async function expirePendingSessions(db: Queryable, limit = 500): Promise<Session[]> {
  const { rows } = await db.query<SessionRow>(
    `UPDATE sessions SET status = 'expired', settled_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id FROM sessions
         WHERE status = 'pending' AND expires_at <= now()
         ORDER BY expires_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING ${COLUMNS}`,
    [limit],
  );
  return rows.map(toSession);
}

/** Sessions whose settlement depends on chain progress (used to advance confirmations). */
export async function listConfirmingSessions(db: Queryable): Promise<Session[]> {
  const { rows } = await db.query<SessionRow>(
    `SELECT ${COLUMNS} FROM sessions WHERE status = 'confirming' ORDER BY updated_at`,
  );
  return rows.map(toSession);
}

export async function countOpenSessions(db: Queryable, merchantId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM sessions
      WHERE merchant_id = $1 AND status IN ('pending', 'confirming')`,
    [merchantId],
  );
  return Number(rows[0]?.count ?? '0');
}
