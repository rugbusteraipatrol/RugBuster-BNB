import type { Queryable } from './pool.js';
import type { Payment, PaymentMatchKind } from './types.js';

interface PaymentRow {
  id: string;
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_hash: string;
  from_address: string;
  to_address: string;
  amount_usdc: string;
  session_id: string | null;
  match_kind: PaymentMatchKind;
  status: 'active' | 'orphaned';
  observed_at: Date;
  orphaned_at: Date | null;
}

const COLUMNS = `id, tx_hash, log_index, block_number, block_hash, from_address, to_address,
  amount_usdc, session_id, match_kind, status, observed_at, orphaned_at`;

const toPayment = (row: PaymentRow): Payment => ({
  id: BigInt(row.id),
  txHash: row.tx_hash,
  logIndex: row.log_index,
  blockNumber: BigInt(row.block_number),
  blockHash: row.block_hash,
  fromAddress: row.from_address,
  toAddress: row.to_address,
  amountUsdc: BigInt(row.amount_usdc),
  sessionId: row.session_id,
  matchKind: row.match_kind,
  status: row.status,
  observedAt: row.observed_at,
  orphanedAt: row.orphaned_at,
});

export interface RecordPaymentInput {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  fromAddress: string;
  toAddress: string;
  amountUsdc: bigint;
  sessionId: string | null;
  matchKind: PaymentMatchKind;
}

export interface RecordPaymentResult {
  payment: Payment;
  inserted: boolean;
}

/**
 * Idempotent on (tx_hash, log_index), so re-scanning a block range — which the
 * watcher does on every tick, by design — never double-counts a transfer.
 *
 * If the same log reappears under a different block hash (reorg re-inclusion) the
 * row is revived: block coordinates are refreshed and status returns to 'active'.
 */
export async function recordPayment(db: Queryable, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const { rows } = await db.query<PaymentRow & { inserted: boolean }>(
    `INSERT INTO payments (tx_hash, log_index, block_number, block_hash, from_address,
        to_address, amount_usdc, session_id, match_kind, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
     ON CONFLICT (tx_hash, log_index) DO UPDATE SET
       block_number = EXCLUDED.block_number,
       block_hash   = EXCLUDED.block_hash,
       status       = 'active',
       orphaned_at  = NULL
     RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
    [
      input.txHash,
      input.logIndex,
      input.blockNumber.toString(),
      input.blockHash,
      input.fromAddress,
      input.toAddress,
      input.amountUsdc.toString(),
      input.sessionId,
      input.matchKind,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('recordPayment returned no row');
  return { payment: toPayment(row), inserted: row.inserted };
}

/** Total value of still-canonical transfers attributed to a session. */
export async function sumActivePayments(db: Queryable, sessionId: string): Promise<bigint> {
  const { rows } = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_usdc), 0)::text AS total
       FROM payments WHERE session_id = $1 AND status = 'active'`,
    [sessionId],
  );
  return BigInt(rows[0]?.total ?? '0');
}

export async function listActivePaymentsForSession(db: Queryable, sessionId: string): Promise<Payment[]> {
  const { rows } = await db.query<PaymentRow>(
    `SELECT ${COLUMNS} FROM payments
      WHERE session_id = $1 AND status = 'active'
      ORDER BY block_number, log_index`,
    [sessionId],
  );
  return rows.map(toPayment);
}

/** Active payments at or above a block height — the reorg re-validation window. */
export async function listActivePaymentsFromBlock(db: Queryable, fromBlock: bigint): Promise<Payment[]> {
  const { rows } = await db.query<PaymentRow>(
    `SELECT ${COLUMNS} FROM payments
      WHERE status = 'active' AND block_number >= $1
      ORDER BY block_number, log_index`,
    [fromBlock.toString()],
  );
  return rows.map(toPayment);
}

/** Marks a transfer as no longer canonical. Rows are kept for the audit trail. */
export async function orphanPayment(db: Queryable, id: bigint): Promise<Payment | null> {
  const { rows } = await db.query<PaymentRow>(
    `UPDATE payments SET status = 'orphaned', orphaned_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING ${COLUMNS}`,
    [id.toString()],
  );
  return rows[0] ? toPayment(rows[0]) : null;
}

export async function listUnmatchedPayments(db: Queryable, limit = 100): Promise<Payment[]> {
  const { rows } = await db.query<PaymentRow>(
    `SELECT ${COLUMNS} FROM payments
      WHERE match_kind = 'unmatched' AND status = 'active'
      ORDER BY observed_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toPayment);
}
