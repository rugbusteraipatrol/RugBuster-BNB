import { describe, expect, it } from 'vitest';
import { loadConfig, USDC_BASE_MAINNET } from '../../src/config.js';

const MINIMAL = { DATABASE_URL: 'postgres://localhost/basepay_test' };

describe('loadConfig', () => {
  it('defaults to USDC on Base mainnet', () => {
    const config = loadConfig(MINIMAL);
    expect(config.chain.chainId).toBe(8453);
    expect(config.chain.usdcAddress).toBe(USDC_BASE_MAINNET);
    expect(config.sessions.ttlSeconds).toBe(900);
    expect(config.watcher.confirmationsRequired).toBe(3);
    expect(config.sessions.offsetMax).toBe(1000);
  });

  it('requires a database url', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a stale ceiling below the cache TTL, which would never serve a stale price', () => {
    expect(() =>
      loadConfig({ ...MINIMAL, PRICE_CACHE_TTL_SECONDS: '600', PRICE_MAX_STALE_SECONDS: '60' }),
    ).toThrow(/PRICE_MAX_STALE_SECONDS/);
  });

  it('rejects a malformed token address', () => {
    expect(() => loadConfig({ ...MINIMAL, USDC_ADDRESS: '0x1234' })).toThrow(/USDC_ADDRESS/);
  });

  it('parses the CORS allowlist into origins, keeping "*" as a wildcard', () => {
    expect(loadConfig(MINIMAL).http.corsAllowedOrigins).toBe('*');
    expect(
      loadConfig({ ...MINIMAL, CORS_ALLOWED_ORIGINS: 'https://shop.example, https://www.shop.example' }).http
        .corsAllowedOrigins,
    ).toEqual(['https://shop.example', 'https://www.shop.example']);
  });

  it('rejects out-of-range numbers rather than clamping them silently', () => {
    expect(() => loadConfig({ ...MINIMAL, SESSION_TTL_SECONDS: '5' })).toThrow(/SESSION_TTL_SECONDS/);
    expect(() => loadConfig({ ...MINIMAL, CONFIRMATIONS_REQUIRED: '0' })).toThrow(/CONFIRMATIONS_REQUIRED/);
    expect(() => loadConfig({ ...MINIMAL, AMOUNT_OFFSET_MAX: '0' })).toThrow(/AMOUNT_OFFSET_MAX/);
  });

  it('reads booleans and optional strings the way .env files actually write them', () => {
    expect(loadConfig({ ...MINIMAL, WATCHER_ENABLED: 'false' }).watcher.enabled).toBe(false);
    expect(loadConfig({ ...MINIMAL, WATCHER_ENABLED: '0' }).watcher.enabled).toBe(false);
    expect(loadConfig({ ...MINIMAL, WATCHER_ENABLED: '1' }).watcher.enabled).toBe(true);
    expect(loadConfig({ ...MINIMAL, ADMIN_TOKEN: '' }).adminToken).toBeUndefined();
    expect(loadConfig({ ...MINIMAL, WATCHER_START_BLOCK: '12345' }).watcher.startBlock).toBe(12345n);
  });
});
