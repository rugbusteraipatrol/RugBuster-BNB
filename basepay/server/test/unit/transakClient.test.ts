import { describe, expect, it } from 'vitest';
import { TransakClient, TransakError } from '../../src/onramp/transak.js';

const REQUEST = {
  walletAddress: '0x1111111111111111111111111111111111111111',
  fiatAmountUsd: '45.00',
  partnerOrderId: '3c3b75b3-0359-42f2-b428-bec377a82647',
  referrerDomain: 'pay.example.test',
  userIp: '203.0.113.7',
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

/** An in-memory Transak: hands out numbered tokens and widget URLs, with a controllable clock. */
function fakeTransak(
  options: { environment?: 'STAGING' | 'PRODUCTION'; widgetStatuses?: number[]; tokenLifetimeSeconds?: number } = {},
) {
  const calls: Call[] = [];
  const widgetStatuses = [...(options.widgetStatuses ?? [])];
  let clockMs = 1_700_000_000_000;
  let tokens = 0;

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });

    if (url.endsWith('/partners/api/v2/refresh-token')) {
      tokens += 1;
      const expiresAt = Math.floor(clockMs / 1000) + (options.tokenLifetimeSeconds ?? 7 * 86_400);
      return Response.json({ data: { accessToken: `token-${tokens}`, expiresAt } });
    }
    const status = widgetStatuses.shift() ?? 200;
    if (status !== 200) return new Response('{"error":{"message":"refused"}}', { status });
    return Response.json({ data: { widgetUrl: `https://global-stg.transak.com?apiKey=pk_test&sessionId=s${calls.length}` } });
  }) as typeof fetch;

  const client = new TransakClient({
    apiKey: 'pk_test',
    apiSecret: 'sk_secret',
    environment: options.environment ?? 'STAGING',
    fetch: fetchImpl,
    now: () => clockMs,
  });

  return {
    client,
    calls,
    refreshCalls: () => calls.filter((c) => c.url.endsWith('/refresh-token')),
    widgetCalls: () => calls.filter((c) => c.url.endsWith('/auth/session')),
    advanceSeconds(seconds: number) {
      clockMs += seconds * 1000;
    },
  };
}

describe('TransakClient', () => {
  it('trades the API secret for a token, then asks for a widget URL that pays the merchant', async () => {
    const transak = fakeTransak();
    const url = await transak.client.createWidgetUrl(REQUEST);
    expect(url).toContain('sessionId=');

    const [refresh, widget] = transak.calls;
    expect(refresh?.url).toBe('https://api-stg.transak.com/partners/api/v2/refresh-token');
    expect(refresh?.headers['api-secret']).toBe('sk_secret');
    expect(refresh?.headers['x-api-key']).toBe('pk_test');
    expect(refresh?.body).toEqual({ apiKey: 'pk_test' });

    expect(widget?.url).toBe('https://api-gateway-stg.transak.com/api/v2/auth/session');
    expect(widget?.headers['access-token']).toBe('token-1');
    expect(widget?.headers['x-user-ip']).toBe('203.0.113.7');
    // The secret goes to the token endpoint and nowhere else.
    expect(widget?.headers['api-secret']).toBeUndefined();
    expect(widget?.body).toEqual({
      widgetParams: {
        apiKey: 'pk_test',
        referrerDomain: 'pay.example.test',
        productsAvailed: 'BUY',
        fiatCurrency: 'USD',
        fiatAmount: 45,
        cryptoCurrencyCode: 'USDC',
        network: 'base',
        walletAddress: REQUEST.walletAddress,
        disableWalletAddressForm: true,
        partnerOrderId: REQUEST.partnerOrderId,
      },
    });
  });

  it('reuses one access token across checkouts', async () => {
    const transak = fakeTransak();
    for (let i = 0; i < 3; i += 1) await transak.client.createWidgetUrl(REQUEST);
    expect(transak.refreshCalls()).toHaveLength(1);
    expect(transak.widgetCalls()).toHaveLength(3);
  });

  it('shares a single token refresh between concurrent checkouts', async () => {
    const transak = fakeTransak();
    await Promise.all(Array.from({ length: 5 }, () => transak.client.createWidgetUrl(REQUEST)));
    expect(transak.refreshCalls()).toHaveLength(1);
  });

  it('refreshes the token before it expires rather than after', async () => {
    const transak = fakeTransak();
    await transak.client.createWidgetUrl(REQUEST);

    transak.advanceSeconds(7 * 86_400 - 30 * 60); // half an hour of validity left
    await transak.client.createWidgetUrl(REQUEST);

    expect(transak.refreshCalls()).toHaveLength(2);
    expect(transak.widgetCalls()[1]?.headers['access-token']).toBe('token-2');
  });

  it('retries once with a fresh token when Transak refuses the cached one', async () => {
    const transak = fakeTransak({ widgetStatuses: [401] });
    await expect(transak.client.createWidgetUrl(REQUEST)).resolves.toContain('sessionId=');

    expect(transak.refreshCalls()).toHaveLength(2);
    expect(transak.widgetCalls().map((c) => c.headers['access-token'])).toEqual(['token-1', 'token-2']);
  });

  it('fails with the status and without the secret when Transak refuses the request', async () => {
    const transak = fakeTransak({ widgetStatuses: [500] });
    const failure = await transak.client.createWidgetUrl(REQUEST).catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(TransakError);
    expect((failure as TransakError).status).toBe(500);
    expect((failure as TransakError).message).not.toContain('sk_secret');
  });

  it('uses the production hosts in production', async () => {
    const transak = fakeTransak({ environment: 'PRODUCTION' });
    await transak.client.createWidgetUrl(REQUEST);
    expect(transak.calls.map((c) => c.url)).toEqual([
      'https://api.transak.com/partners/api/v2/refresh-token',
      'https://api-gateway.transak.com/api/v2/auth/session',
    ]);
  });
});
