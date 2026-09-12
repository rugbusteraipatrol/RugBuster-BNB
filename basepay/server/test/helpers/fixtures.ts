import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { loadConfig, type Config } from '../../src/config.js';
import { upsertMerchant } from '../../src/db/merchants.js';
import type { Merchant } from '../../src/db/types.js';
import { PriceService } from '../../src/price/priceService.js';
import { TEST_DATABASE_URL } from './db.js';

export const MERCHANT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export const BUYER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Config for tests: watcher and webhook workers off unless a test starts them. */
export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    DATABASE_URL: TEST_DATABASE_URL,
    ADMIN_TOKEN: 'test-admin-token',
    WATCHER_ENABLED: 'false',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

/** A price service pinned to parity, so USD and USDC amounts line up in assertions. */
export function fixedPriceService(priceUsd = '1.00000000'): PriceService {
  const service = new PriceService({
    fetchPrice: async () => priceUsd,
    cacheTtlSeconds: 60,
    maxStaleSeconds: 600,
  });
  service.seed(priceUsd);
  return service;
}

export async function seedMerchant(
  pool: pg.Pool,
  overrides: Partial<{ id: string; walletAddress: string; webhookUrl: string | null; webhookSecret: string | null }> = {},
): Promise<Merchant> {
  return upsertMerchant(pool, {
    id: overrides.id ?? 'demo',
    walletAddress: overrides.walletAddress ?? MERCHANT_ADDRESS,
    webhookUrl: overrides.webhookUrl ?? null,
    webhookSecret: overrides.webhookSecret ?? null,
  });
}

let logIndex = 0;

/** A synthetic USDC Transfer, shaped exactly like one decoded from a viem log. */
export function transfer(args: {
  to: string;
  value: bigint;
  blockNumber?: bigint;
  blockHash?: string;
  txHash?: string;
  from?: string;
}) {
  logIndex += 1;
  return {
    txHash: args.txHash ?? `0x${randomUUID().replace(/-/g, '').padEnd(64, '0')}`,
    logIndex,
    blockNumber: args.blockNumber ?? 100n,
    blockHash: args.blockHash ?? `0x${'ab'.repeat(32)}`,
    from: args.from ?? BUYER_ADDRESS,
    to: args.to,
    value: args.value,
  };
}
