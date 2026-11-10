import { readFile } from 'node:fs/promises';
import type { Queryable } from '../db/pool.js';
import { upsertMerchant } from '../db/merchants.js';
import { normalizeAddress } from '../address.js';
import { logger } from '../logger.js';
import { z } from 'zod';

const seedSchema = z.object({
  merchants: z.array(
    z.object({
      merchantId: z.string().min(1).max(128),
      walletAddress: z.string(),
      webhookUrl: z.string().url().optional(),
      webhookSecret: z.string().min(1).optional(),
    }),
  ),
});

/**
 * `env:NAME` reads the value from the environment instead of the file, so a
 * checked-in seed file never has to contain a webhook secret.
 */
function resolveSecret(value: string | undefined, merchantId: string): string | null {
  if (value === undefined) return null;
  if (!value.startsWith('env:')) return value;
  const name = value.slice('env:'.length);
  const resolved = process.env[name];
  if (!resolved) {
    throw new Error(`Merchant "${merchantId}" references ${value} but ${name} is not set`);
  }
  return resolved;
}

/** Applies a merchants config file. Upserts, so it is safe to re-run on every boot. */
export async function seedMerchantsFromFile(db: Queryable, filePath: string): Promise<number> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = seedSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `Invalid merchants file ${filePath}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    );
  }

  for (const entry of parsed.data.merchants) {
    const secret = resolveSecret(entry.webhookSecret, entry.merchantId);
    if ((entry.webhookUrl === undefined) !== (secret === null)) {
      throw new Error(`Merchant "${entry.merchantId}" must set webhookUrl and webhookSecret together`);
    }
    await upsertMerchant(db, {
      id: entry.merchantId,
      walletAddress: normalizeAddress(entry.walletAddress, `merchants.${entry.merchantId}.walletAddress`),
      webhookUrl: entry.webhookUrl ?? null,
      webhookSecret: secret,
    });
  }

  logger.info({ count: parsed.data.merchants.length, filePath }, 'seeded merchants');
  return parsed.data.merchants.length;
}
