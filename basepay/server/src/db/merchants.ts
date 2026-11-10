import type { Queryable } from './pool.js';
import type { Merchant, MerchantPlan } from './types.js';

interface MerchantRow {
  id: string;
  wallet_address: string;
  webhook_url: string | null;
  webhook_secret: string | null;
  plan: MerchantPlan;
  plan_expires_at: Date | null;
  merchant_key_hash: string | null;
  site_url: string | null;
  platform: string | null;
  created_at: Date;
  updated_at: Date;
}

const toMerchant = (row: MerchantRow): Merchant => ({
  id: row.id,
  walletAddress: row.wallet_address,
  webhookUrl: row.webhook_url,
  webhookSecret: row.webhook_secret,
  plan: row.plan,
  planExpiresAt: row.plan_expires_at,
  merchantKeyHash: row.merchant_key_hash,
  siteUrl: row.site_url,
  platform: row.platform,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const COLUMNS =
  'id, wallet_address, webhook_url, webhook_secret, plan, plan_expires_at, merchant_key_hash, site_url, platform, created_at, updated_at';

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

export interface RegisterMerchantInput {
  id: string;
  walletAddress: string;
  /** Null for merchants that take payment links only: there is no site to notify. */
  webhookUrl: string | null;
  webhookSecret: string | null;
  merchantKeyHash: string;
  siteUrl: string | null;
  platform: string | null;
}

/** Self-registration. Unlike `upsertMerchant` this never overwrites: an id collision is an error. */
export async function registerMerchant(db: Queryable, input: RegisterMerchantInput): Promise<Merchant> {
  const { rows } = await db.query<MerchantRow>(
    `INSERT INTO merchants (id, wallet_address, webhook_url, webhook_secret, merchant_key_hash, site_url, platform)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [input.id, input.walletAddress, input.webhookUrl, input.webhookSecret, input.merchantKeyHash, input.siteUrl, input.platform],
  );
  const row = rows[0];
  if (!row) throw new Error('registerMerchant returned no row');
  return toMerchant(row);
}

export interface MerchantUpdate {
  walletAddress?: string;
  webhook?: { url: string; secret: string };
}

/** Partial update for a self-registered merchant; returns null when the id is unknown. */
export async function updateMerchant(db: Queryable, id: string, update: MerchantUpdate): Promise<Merchant | null> {
  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [id];
  if (update.walletAddress !== undefined) {
    params.push(update.walletAddress);
    sets.push(`wallet_address = $${params.length}`);
  }
  if (update.webhook !== undefined) {
    params.push(update.webhook.url, update.webhook.secret);
    sets.push(`webhook_url = $${params.length - 1}`, `webhook_secret = $${params.length}`);
  }
  const { rows } = await db.query<MerchantRow>(
    `UPDATE merchants SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
    params,
  );
  return rows[0] ? toMerchant(rows[0]) : null;
}

export async function setMerchantPlan(
  db: Queryable,
  id: string,
  plan: MerchantPlan,
  expiresAt: Date | null,
): Promise<Merchant | null> {
  const { rows } = await db.query<MerchantRow>(
    `UPDATE merchants SET plan = $2, plan_expires_at = $3, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, plan, expiresAt],
  );
  return rows[0] ? toMerchant(rows[0]) : null;
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
