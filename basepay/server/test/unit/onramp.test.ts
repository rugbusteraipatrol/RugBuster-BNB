import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { loadConfig, type Config } from '../../src/config.js';
import { buildOnrampLink } from '../../src/onramp/index.js';
import type { PriceService } from '../../src/price/priceService.js';
import { SessionService } from '../../src/sessions/sessionService.js';

const BASE_ENV = { DATABASE_URL: 'postgres://localhost/basepay_test' };
const TRANSAK_ENV = {
  ONRAMP_PROVIDER: 'transak',
  TRANSAK_API_KEY: 'pk_test',
  TRANSAK_API_SECRET: 'sk_test',
  PUBLIC_BASE_URL: 'https://pay.example.test',
};
const config = (extra: Record<string, string>): Config => loadConfig({ ...BASE_ENV, ...extra });

const QUOTE = {
  sessionId: '3c3b75b3-0359-42f2-b428-bec377a82647',
  payToAddress: '0x1111111111111111111111111111111111111111',
  amountUsd: '45.00',
  amountUsdCents: 4500n,
  amountUsdc: '45.000123',
};

describe('buildOnrampLink', () => {
  it('returns nothing when no provider is configured', () => {
    expect(buildOnrampLink(config({}), QUOTE)).toBeNull();
  });

  it("sends a Transak buyer to BasePay's own hand-off page, never straight to Transak", () => {
    const link = buildOnrampLink(config(TRANSAK_ENV), QUOTE);
    expect(link).toEqual({
      provider: 'transak',
      label: 'Pay with card via Transak',
      url: `https://pay.example.test/onramp/${QUOTE.sessionId}`,
    });
    expect(link?.url).not.toContain('sk_test');
  });

  it('builds the hand-off URL from the origin, whatever PUBLIC_BASE_URL is written as', () => {
    const link = buildOnrampLink(config({ ...TRANSAK_ENV, PUBLIC_BASE_URL: 'https://pay.example.test/' }), QUOTE);
    expect(link?.url).toBe(`https://pay.example.test/onramp/${QUOTE.sessionId}`);
  });

  it("does not offer cards below Transak's minimum", () => {
    expect(buildOnrampLink(config(TRANSAK_ENV), { ...QUOTE, amountUsd: '4.99', amountUsdCents: 499n })).toBeNull();
    expect(buildOnrampLink(config(TRANSAK_ENV), { ...QUOTE, amountUsd: '5.00', amountUsdCents: 500n })).not.toBeNull();

    const higher = config({ ...TRANSAK_ENV, ONRAMP_MIN_USD: '20' });
    expect(buildOnrampLink(higher, { ...QUOTE, amountUsd: '19.99', amountUsdCents: 1999n })).toBeNull();
  });

  it('prefills MoonPay with the Base USDC currency code', () => {
    const link = buildOnrampLink(config({ ONRAMP_PROVIDER: 'moonpay', MOONPAY_API_KEY: 'pk_live' }), QUOTE);
    const url = new URL(link?.url ?? '');
    expect(url.origin).toBe('https://buy.moonpay.com');
    expect(url.searchParams.get('currencyCode')).toBe('usdc_base');
    expect(url.searchParams.get('walletAddress')).toBe(QUOTE.payToAddress);
    expect(url.searchParams.get('baseCurrencyAmount')).toBe('45.00');
  });

  it('refuses to boot with a provider it cannot use, instead of rendering a broken button', () => {
    expect(() => config({ ONRAMP_PROVIDER: 'transak' })).toThrow(/TRANSAK_API_KEY/);
    expect(() => config({ ...TRANSAK_ENV, TRANSAK_API_SECRET: '' })).toThrow(/TRANSAK_API_SECRET/);
    expect(() => config({ ...TRANSAK_ENV, PUBLIC_BASE_URL: '' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => config({ ...TRANSAK_ENV, PUBLIC_BASE_URL: 'not a url' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => config({ ONRAMP_PROVIDER: 'moonpay' })).toThrow(/MOONPAY_API_KEY/);
  });
});

describe('card checkout', () => {
  it('is refused when card payments are not enabled, before touching the database', async () => {
    const service = new SessionService({} as pg.Pool, config({}), {} as PriceService);
    await expect(service.createCardCheckoutUrl(QUOTE.sessionId, '203.0.113.7')).rejects.toMatchObject({
      code: 'ONRAMP_DISABLED',
      statusCode: 404,
    });
  });
});
