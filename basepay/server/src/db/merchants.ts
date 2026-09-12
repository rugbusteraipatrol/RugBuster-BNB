import type { Queryable } from './pool.js';
import type { Merchant } from './types.js';

interface MerchantRow {
  id: string;
  wallet_address: string;
  webhook_url: string | null;
  webhook_secret: string | null;
  created_at: Date;
  updated_at: Date;
}

const toMerchant = (row: MerchantRow): Merchant => ({
  id: row.id,
  walletAddress: row.wallet_address,
  webhookUrl: row.webhook_url,
  webhookSecret: row.webhook_secret,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const COLUMNS = 'id, wallet_address, webhook_url, webhook_secret, created_at, updated_at';

export interface MerchantInput {
  id: string;
  walletAddress: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
}

export async function getMerchant(db: Queryable, id: string): Promise<Merchant | null> {
  const { rows } = await db.query<MerchantRow>(`SELECT ${COLUMNS} FROM merchants WHERE id = $1`, [id]);
  return rows[0] ? toMerchant(rows[0]) : null;
}

export async function listMerchants(db: Queryable): Promise<Merchant[]> {
  const { rows } = await db.query<MerchantRow>(`SELECT ${COLUMNS} FROM merchants ORDER BY id`);
  return rows.map(toMerchant);
}

export async function upsertMerchant(db: Queryable, input: MerchantInput): Promise<Merchant> {
  const { rows } = await db.query<MerchantRow>(
    `INSERT INTO merchants (id, wallet_address, webhook_url, webhook_secret)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       wallet_address = EXCLUDED.wallet_address,
       webhook_url    = EXCLUDED.webhook_url,
       webhook_secret = EXCLUDED.webhook_secret,
       updated_at     = now()
     RETURNING ${COLUMNS}`,
    [input.id, input.walletAddress, input.webhookUrl, input.webhookSecret],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertMerchant returned no row');
  return toMerchant(row);
}

/**
 * Every merchant address, lowercased. This is the watcher's `to` filter: we scan
 * for all merchant addresses rather than only those with open sessions, so a
 * transfer that lands moments after a session is created — or one that belongs to
 * no session at all — is still observed and recorded instead of silently dropped.
 */
export async function listMerchantAddresses(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ address: string }>(
    'SELECT DISTINCT lower(wallet_address) AS address FROM merchants',
  );
  return rows.map((r) => r.address);
}

/**
 * Merchant addresses that currently have at least one open session. This is the
 * watcher's `to` filter — we never scan the whole USDC Transfer firehose.
 * Returned lowercased, which is how addresses arrive in log topics.
 */
export async function listAddressesWithOpenSessions(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ address: string }>(
    `SELECT DISTINCT lower(s.pay_to_address) AS address
       FROM sessions s
      WHERE s.status IN ('pending', 'confirming')`,
  );
  return rows.map((r) => r.address);
}
