import type { Config } from '../config.js';

export interface OnrampLink {
  provider: 'transak' | 'moonpay';
  /** Human label for the widget button. */
  label: string;
  url: string;
}

export interface OnrampQuote {
  payToAddress: string;
  amountUsd: string;
  amountUsdc: string;
}

/**
 * Builds a prefilled buy-and-send link: USD in, USDC on Base out, delivered to
 * the merchant address. We never take custody — the on-ramp sends straight to
 * the merchant.
 *
 * Caveat carried through to the README: on-ramps do not deliver an exact amount
 * (fees, their own rounding), so a session paid this way settles through the
 * tolerance path in `sessions/matching.ts` rather than an exact match.
 */
export function buildOnrampLink(config: Config, quote: OnrampQuote): OnrampLink | null {
  switch (config.onramp.provider) {
    case 'none':
      return null;

    case 'transak': {
      const base =
        config.onramp.environment === 'STAGING'
          ? 'https://global-stg.transak.com/'
          : 'https://global.transak.com/';
      const url = new URL(base);
      url.searchParams.set('apiKey', config.onramp.apiKey);
      url.searchParams.set('productsAvailed', 'BUY');
      url.searchParams.set('fiatCurrency', 'USD');
      url.searchParams.set('fiatAmount', quote.amountUsd);
      url.searchParams.set('cryptoCurrencyCode', 'USDC');
      url.searchParams.set('network', 'base');
      url.searchParams.set('walletAddress', quote.payToAddress);
      url.searchParams.set('disableWalletAddressForm', 'true');
      url.searchParams.set('isFeeCalculationHidden', 'false');
      return { provider: 'transak', label: 'Pay with card via Transak', url: url.toString() };
    }

    case 'moonpay': {
      const url = new URL('https://buy.moonpay.com/');
      url.searchParams.set('apiKey', config.onramp.apiKey);
      url.searchParams.set('currencyCode', 'usdc_base');
      url.searchParams.set('walletAddress', quote.payToAddress);
      url.searchParams.set('baseCurrencyCode', 'usd');
      url.searchParams.set('baseCurrencyAmount', quote.amountUsd);
      url.searchParams.set('lockAmount', 'false');
      return { provider: 'moonpay', label: 'Pay with card via MoonPay', url: url.toString() };
    }
  }
}
