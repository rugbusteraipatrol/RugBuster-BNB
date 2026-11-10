import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeSignature,
  signatureHeaderValue,
  signingPayload,
  verifySignature,
} from '../../src/webhooks/signature.js';

const SECRET = 'whsec_a_merchant_secret_value_1234';
const BODY = JSON.stringify({ id: 'd1', type: 'payment.paid', data: { amountUsdc: '45.000123' } });
const TIMESTAMP = 1_700_000_000;

describe('webhook signing', () => {
  it('signs "timestamp.body" with HMAC-SHA256', () => {
    const expected = createHmac('sha256', SECRET).update(`${TIMESTAMP}.${BODY}`).digest('hex');
    expect(computeSignature(SECRET, TIMESTAMP, BODY)).toBe(expected);
    expect(signingPayload(TIMESTAMP, BODY)).toBe(`${TIMESTAMP}.${BODY}`);
  });

  it('emits a scheme-prefixed header value', () => {
    const header = signatureHeaderValue(SECRET, TIMESTAMP, BODY);
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('verifies its own signature', () => {
    expect(
      verifySignature({
        secret: SECRET,
        rawBody: BODY,
        timestamp: TIMESTAMP,
        signature: signatureHeaderValue(SECRET, TIMESTAMP, BODY),
        nowSeconds: TIMESTAMP + 5,
      }),
    ).toBe(true);
  });

  it('accepts the bare hex signature as well as the prefixed form', () => {
    expect(
      verifySignature({
        secret: SECRET,
        rawBody: BODY,
        timestamp: TIMESTAMP,
        signature: computeSignature(SECRET, TIMESTAMP, BODY),
        nowSeconds: TIMESTAMP,
      }),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = signatureHeaderValue(SECRET, TIMESTAMP, BODY);
    const tampered = BODY.replace('45.000123', '45000.000123');
    expect(
      verifySignature({ secret: SECRET, rawBody: tampered, timestamp: TIMESTAMP, signature, nowSeconds: TIMESTAMP }),
    ).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(
      verifySignature({
        secret: 'whsec_not_the_right_secret_value1',
        rawBody: BODY,
        timestamp: TIMESTAMP,
        signature: signatureHeaderValue(SECRET, TIMESTAMP, BODY),
        nowSeconds: TIMESTAMP,
      }),
    ).toBe(false);
  });

  it('rejects a replay outside the tolerance window, in both directions', () => {
    const signature = signatureHeaderValue(SECRET, TIMESTAMP, BODY);
    const verify = (nowSeconds: number) =>
      verifySignature({ secret: SECRET, rawBody: BODY, timestamp: TIMESTAMP, signature, nowSeconds });

    expect(verify(TIMESTAMP + 300)).toBe(true);
    expect(verify(TIMESTAMP + 301)).toBe(false);
    // A timestamp from the future is just as suspect as one from the past.
    expect(verify(TIMESTAMP - 300)).toBe(true);
    expect(verify(TIMESTAMP - 301)).toBe(false);
  });

  it('cannot be replayed by swapping in a fresh timestamp, because the MAC covers it', () => {
    const signature = signatureHeaderValue(SECRET, TIMESTAMP, BODY);
    const replayedAt = TIMESTAMP + 10_000;
    expect(
      verifySignature({ secret: SECRET, rawBody: BODY, timestamp: replayedAt, signature, nowSeconds: replayedAt }),
    ).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    const bad = ['', 'sha256=', 'sha256=zzzz', 'not-hex', 'sha256=abc'];
    for (const signature of bad) {
      expect(
        verifySignature({ secret: SECRET, rawBody: BODY, timestamp: TIMESTAMP, signature, nowSeconds: TIMESTAMP }),
      ).toBe(false);
    }
  });

  it('rejects a malformed timestamp header without throwing', () => {
    const signature = signatureHeaderValue(SECRET, TIMESTAMP, BODY);
    for (const timestamp of ['', 'yesterday', '1.5', 'NaN']) {
      expect(verifySignature({ secret: SECRET, rawBody: BODY, timestamp, signature, nowSeconds: TIMESTAMP })).toBe(
        false,
      );
    }
  });

  it('accepts the timestamp as a numeric string, as it arrives in a header', () => {
    expect(
      verifySignature({
        secret: SECRET,
        rawBody: BODY,
        timestamp: String(TIMESTAMP),
        signature: signatureHeaderValue(SECRET, TIMESTAMP, BODY),
        nowSeconds: TIMESTAMP,
      }),
    ).toBe(true);
  });

  it('is sensitive to byte-level body differences, so receivers must use the raw body', () => {
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(
      verifySignature({
        secret: SECRET,
        rawBody: reserialised,
        timestamp: TIMESTAMP,
        signature: signatureHeaderValue(SECRET, TIMESTAMP, BODY),
        nowSeconds: TIMESTAMP,
      }),
    ).toBe(false);
  });
});
