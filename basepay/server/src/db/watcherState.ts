import type { Queryable } from './pool.js';
import type { WatcherState } from './types.js';

interface WatcherStateRow {
  id: string;
  last_processed_block: string;
  last_processed_block_hash: string | null;
  updated_at: Date;
}

export async function getWatcherState(db: Queryable, id: string): Promise<WatcherState | null> {
  const { rows } = await db.query<WatcherStateRow>(
    `SELECT id, last_processed_block, last_processed_block_hash, updated_at
       FROM watcher_state WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  return row
    ? {
        id: row.id,
        lastProcessedBlock: BigInt(row.last_processed_block),
        lastProcessedBlockHash: row.last_processed_block_hash,
        updatedAt: row.updated_at,
      }
    : null;
}

/**
 * Advances the bookmark. Monotonic: a lower block never overwrites a higher one,
 * so a late tick cannot rewind the watcher and replay settled payments.
 */
export async function setWatcherState(
  db: Queryable,
  id: string,
  lastProcessedBlock: bigint,
  lastProcessedBlockHash: string | null,
): Promise<void> {
  await db.query(
    `INSERT INTO watcher_state (id, last_processed_block, last_processed_block_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       last_processed_block      = GREATEST(watcher_state.last_processed_block, EXCLUDED.last_processed_block),
       last_processed_block_hash = CASE
         WHEN EXCLUDED.last_processed_block >= watcher_state.last_processed_block
           THEN EXCLUDED.last_processed_block_hash
         ELSE watcher_state.last_processed_block_hash END,
       updated_at = now()`,
    [id, lastProcessedBlock.toString(), lastProcessedBlockHash],
  );
}
