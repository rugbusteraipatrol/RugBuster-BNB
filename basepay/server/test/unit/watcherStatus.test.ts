import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { Watcher } from '../../src/watcher/watcher.js';
import { FakeChain } from '../helpers/fakeChain.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RPC_KEY = 'alch_SECRET123';

/**
 * A watcher whose RPC fails on the first call of every pass. The failure comes
 * before any database access, so no Postgres is needed.
 */
function failingWatcher() {
  const config = loadConfig({ DATABASE_URL: 'postgres://unused', WATCHER_ENABLED: 'true', LOG_LEVEL: 'silent' });
  const client = new FakeChain(USDC, 1).asClient();
  client.getBlockNumber = async () => {
    throw new Error(`RPC Request failed.\n\nURL: https://base-mainnet.g.alchemy.com/v2/${RPC_KEY}\nDetails: range too wide`);
  };
  return new Watcher({} as pg.Pool, config, client);
}

describe('watcher status', () => {
  it('is not ok before any pass has succeeded', () => {
    expect(failingWatcher().getStatus().ok).toBe(false);
  });

  it('stays not ok while every pass fails', async () => {
    const watcher = failingWatcher();
    await watcher.tick();
    await watcher.tick();
    expect(watcher.getStatus().ok).toBe(false);
  });

  it('keeps the RPC API key out of lastError, which /readyz serves publicly', async () => {
    const watcher = failingWatcher();
    await watcher.tick();

    const { lastError } = watcher.getStatus();
    expect(lastError).toContain('URL: https://base-mainnet.g.alchemy.com/[redacted]');
    expect(lastError).not.toContain(RPC_KEY);
  });
});
