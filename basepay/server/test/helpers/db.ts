import type pg from 'pg';
import { migrate } from '../../src/db/migrate.js';
import { createPool } from '../../src/db/pool.js';

/**
 * Integration tests need a real Postgres: the amount reservation, the settlement
 * transitions and the webhook queue are all enforced by constraints and
 * transactions, and a fake would only test the fake.
 *
 * Set TEST_DATABASE_URL (or DATABASE_URL) to point at a throwaway database.
 * Without one, the integration suites skip rather than fail.
 */
export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';
export const hasDatabase = TEST_DATABASE_URL.length > 0;

const TABLES = ['webhook_deliveries', 'payments', 'sessions', 'merchants', 'watcher_state'];

export async function createTestPool(): Promise<pg.Pool> {
  const pool = createPool(TEST_DATABASE_URL);
  await migrate(pool);
  return pool;
}

/** Wipes every table between test cases. Fast enough to run in beforeEach. */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}
