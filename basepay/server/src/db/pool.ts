import pg from 'pg';
import { logger } from '../logger.js';

export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export function createPool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // A managed Postgres drops idle connections when its compute restarts or
  // scales. node-postgres re-emits that on the pool as 'error', and an
  // EventEmitter with no 'error' listener throws, which kills the whole process.
  // The pool discards the broken client itself, so logging is all that is needed.
  pool.on('error', (err) => {
    logger.warn({ err }, 'idle database client error; the pool will replace it');
  });

  return pool;
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection is already broken; the pool will discard it.
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres error code for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; constraint?: unknown };
  if (e.code !== UNIQUE_VIOLATION) return false;
  return constraint === undefined || e.constraint === constraint;
}
