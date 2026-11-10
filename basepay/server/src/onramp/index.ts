import type { Config } from '../config.js';

export interface OnrampLink {
  provider: 'transak' | 'moonpay';
  /** Human label for the widget button. */
  label: string;
  url: string;
}

export interface OnrampQuote {
  sessionId: string;
  payToAddress: string;
  amountUsd: string;
  amountUsdCents: bigint;
  amountUsdc: string;
}

/**
 * The card-payment link shown under the wallet options. We never take custody:
 * the on-ramp sends USDC straight to the merchant.
 *
 * On-ramps do not deliver an exact amount (fees, their own rounding), so a
 * session paid this way settles through the tolerance path in
 * `sessions/matching.ts` rather than an exact match.
 */
export function buildOnrampLink(config: Config, quote: OnrampQuote): OnrampLink | null {
  switch (config.onramp.provider) {
    case 'none':
      return null;

    case 'transak': {
      if (quote.amountUsdCents < BigInt(config.onramp.minAmountUsdCents)) return null;
      // BasePay's own hand-off page, which asks the server for a single-use
      // Transak URL when the buyer clicks. See api/routes/onrampPage.ts.
      return {
        provider: 'transak',
        label: 'Pay with card via Transak',
        url: `${config.onramp.publicBaseUrl}/onramp/${quote.sessionId}`,
      };
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
