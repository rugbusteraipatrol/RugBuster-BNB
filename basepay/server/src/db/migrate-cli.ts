import 'dotenv/config';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { migrate } from './migrate.js';
import { createPool } from './pool.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

try {
  const applied = await migrate(pool);
  logger.info({ applied }, applied.length > 0 ? 'migrations applied' : 'database already up to date');
} catch (err) {
  logger.error({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await pool.end();
}
