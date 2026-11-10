import { describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';

describe('createPool', () => {
  // Neon (and any managed Postgres) drops idle connections when its compute
  // restarts. node-postgres re-emits that on the pool as 'error', and an
  // EventEmitter with no 'error' listener throws, which takes the whole API down.
  it('survives an error from an idle client instead of crashing the process', async () => {
    const pool = createPool('postgres://user:pass@127.0.0.1:1/none');
    try {
      expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow();
    } finally {
      await pool.end();
    }
  });
});
