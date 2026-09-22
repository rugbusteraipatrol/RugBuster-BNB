import { describe, expect, it } from 'vitest';
import { effectivePlan, merchantIdFor, monthStart } from '../../src/merchants/plans.js';
import { assertPublicWebhookUrl, verifyWebhookEndpoint } from '../../src/merchants/verifyWebhook.js';
import { verifySignature } from '../../src/webhooks/signature.js';

describe('effectivePlan', () => {
  const now = new Date('2026-09-22T12:00:00Z');

  it('treats a lapsed pro plan as free', () => {
    expect(effectivePlan({ plan: 'pro', planExpiresAt: null }, now)).toBe('pro');
    expect(effectivePlan({ plan: 'pro', planExpiresAt: new Date('2026-12-01T00:00:00Z') }, now)).toBe('pro');
    expect(effectivePlan({ plan: 'pro', planExpiresAt: new Date('2026-09-01T00:00:00Z') }, now)).toBe('free');
    expect(effectivePlan({ plan: 'free', planExpiresAt: null }, now)).toBe('free');
  });

  it('resets usage on the first of the month, UTC', () => {
    expect(monthStart(new Date('2026-09-22T23:59:59Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('merchantIdFor', () => {
  it('derives a readable id from the shop host', () => {
    expect(merchantIdFor('https://www.Kaseta-Shop.rs/wp-admin/', 'a1b2')).toBe('kaseta-shop-rs-a1b2');
    expect(merchantIdFor(null, 'a1b2')).toBe('shop-a1b2');
  });

  it('falls back to the seller name when there is no site', () => {
    expect(merchantIdFor('Fedja Photography', 'a1b2')).toBe('fedja-photography-a1b2');
    expect(merchantIdFor('!!!', 'a1b2')).toBe('shop-a1b2');
  });
});

describe('assertPublicWebhookUrl', () => {
  it('requires https and a public host in production', () => {
    expect(() => assertPublicWebhookUrl('http://shop.example/?wc-api=basepay', true)).toThrow(/https/);
    expect(() => assertPublicWebhookUrl('https://localhost/hook', true)).toThrow(/public/);
    expect(() => assertPublicWebhookUrl('https://10.0.0.5/hook', true)).toThrow(/public/);
    expect(() => assertPublicWebhookUrl('https://192.168.1.1/hook', true)).toThrow(/public/);
    expect(() => assertPublicWebhookUrl('https://[::1]/hook', true)).toThrow(/public/);
    expect(() => assertPublicWebhookUrl('https://user:pw@shop.example/hook', true)).toThrow(/credentials/);
    expect(assertPublicWebhookUrl('https://shop.example/?wc-api=basepay', true).href).toBe(
      'https://shop.example/?wc-api=basepay',
    );
  });

  it('allows plain http to a local host outside production', () => {
    expect(assertPublicWebhookUrl('http://localhost:8080/hook', false).href).toBe('http://localhost:8080/hook');
  });
});

describe('verifyWebhookEndpoint', () => {
  const secret = 'whsec_test_secret_that_is_long_enough_0123';

  it('passes when the endpoint verifies the signature and echoes the challenge', async () => {
    let seen: { url: string; verified: boolean } | null = null;
    await verifyWebhookEndpoint('https://shop.example/hook', secret, async (url, init) => {
      const headers = init.headers as Record<string, string>;
      const rawBody = String(init.body);
      const verified = verifySignature({
        secret,
        rawBody,
        timestamp: headers['x-basepay-timestamp'] ?? '',
        signature: headers['x-basepay-signature'] ?? '',
      });
      seen = { url, verified };
      const { data } = JSON.parse(rawBody) as { data: { challenge: string } };
      return new Response(JSON.stringify({ challenge: data.challenge }), { status: 200 });
    });
    expect(seen).toEqual({ url: 'https://shop.example/hook', verified: true });
  });

  it('rejects an endpoint that answers but does not echo the challenge', async () => {
    await expect(
      verifyWebhookEndpoint('https://shop.example/hook', secret, async () => new Response('ok', { status: 200 })),
    ).rejects.toMatchObject({ code: 'WEBHOOK_CHALLENGE_MISMATCH' });
  });

  it('rejects a non-2xx answer and an unreachable host with distinct codes', async () => {
    await expect(
      verifyWebhookEndpoint('https://shop.example/hook', secret, async () => new Response('', { status: 404 })),
    ).rejects.toMatchObject({ code: 'WEBHOOK_REJECTED' });
    await expect(
      verifyWebhookEndpoint('https://shop.example/hook', secret, async () => {
        throw new Error('ECONNREFUSED');
      }),
    ).rejects.toMatchObject({ code: 'WEBHOOK_UNREACHABLE' });
  });
});
