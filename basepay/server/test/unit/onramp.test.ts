import { describe, expect, it } from 'vitest';
import { loadConfig, type Config } from '../../src/config.js';
import { buildOnrampLink } from '../../src/onramp/index.js';

const BASE_ENV = { DATABASE_URL: 'postgres://localhost/basepay_test' };
const config = (extra: Record<string, string>): Config => loadConfig({ ...BASE_ENV, ...extra });

const QUOTE = {
  payToAddress: '0x1111111111111111111111111111111111111111',
  amountUsd: '45.00',
  amountUsdc: '45.000123',
};

describe('buildOnrampLink', () => {
  it('returns nothing when no provider is configured', () => {
    expect(buildOnrampLink(config({}), QUOTE)).toBeNull();
  });

  it('prefills Transak with USDC on Base sent to the merchant', () => {
    const link = buildOnrampLink(config({ ONRAMP_PROVIDER: 'transak', TRANSAK_API_KEY: 'pk_test' }), QUOTE);
    expect(link?.provider).toBe('transak');

    const url = new URL(link?.url ?? '');
    expect(url.origin).toBe('https://global.transak.com');
    expect(url.searchParams.get('apiKey')).toBe('pk_test');
    expect(url.searchParams.get('cryptoCurrencyCode')).toBe('USDC');
    expect(url.searchParams.get('network')).toBe('base');
    expect(url.searchParams.get('walletAddress')).toBe(QUOTE.payToAddress);
    expect(url.searchParams.get('fiatAmount')).toBe('45.00');
    expect(url.searchParams.get('fiatCurrency')).toBe('USD');
    // The buyer must not be able to redirect the funds somewhere else.
    expect(url.searchParams.get('disableWalletAddressForm')).toBe('true');
  });

  it('uses the Transak staging host when asked', () => {
    const link = buildOnrampLink(
      config({ ONRAMP_PROVIDER: 'transak', TRANSAK_API_KEY: 'pk_test', TRANSAK_ENVIRONMENT: 'STAGING' }),
      QUOTE,
    );
    expect(new URL(link?.url ?? '').origin).toBe('https://global-stg.transak.com');
  });

  it('prefills MoonPay with the Base USDC currency code', () => {
    const link = buildOnrampLink(config({ ONRAMP_PROVIDER: 'moonpay', MOONPAY_API_KEY: 'pk_live' }), QUOTE);
    const url = new URL(link?.url ?? '');
    expect(url.origin).toBe('https://buy.moonpay.com');
    expect(url.searchParams.get('currencyCode')).toBe('usdc_base');
    expect(url.searchParams.get('walletAddress')).toBe(QUOTE.payToAddress);
    expect(url.searchParams.get('baseCurrencyAmount')).toBe('45.00');
  });

  it('refuses to boot with a provider but no API key, instead of rendering a broken button', () => {
    expect(() => config({ ONRAMP_PROVIDER: 'transak' })).toThrow(/TRANSAK_API_KEY/);
    expect(() => config({ ONRAMP_PROVIDER: 'moonpay' })).toThrow(/MOONPAY_API_KEY/);
  });
});
