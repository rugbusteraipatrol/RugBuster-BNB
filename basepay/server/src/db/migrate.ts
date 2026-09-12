import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { logger } from '../logger.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

/**
 * Applies any migration files not yet recorded in `schema_migrations`, in filename
 * order, one transaction per file. Safe to run on every boot.
 */
export async function migrate(pool: pg.Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const entries = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));

  const newlyApplied: string[] = [];
  for (const file of entries) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Take an advisory lock so concurrent boots cannot race on the same migration.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['basepay:migrations']);
      const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
      if (rowCount === 0) {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        newlyApplied.push(file);
        logger.info({ migration: file }, 'applied migration');
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }
  return newlyApplied;
}
