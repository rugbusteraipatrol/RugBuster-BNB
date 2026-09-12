import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-basepay-signature';
export const TIMESTAMP_HEADER = 'x-basepay-timestamp';
export const EVENT_HEADER = 'x-basepay-event';
export const DELIVERY_HEADER = 'x-basepay-delivery';

/** Default replay window a receiver should accept, in seconds. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * The signed message is `${timestamp}.${rawBody}`.
 *
 * Including the timestamp inside the MAC is what makes the replay check
 * meaningful: an attacker who captures a delivery cannot re-send it later with a
 * fresh timestamp, because changing the timestamp invalidates the signature.
 *
 * Receivers must verify against the *raw* request bytes, not a re-serialised
 * object — JSON key order and whitespace are not stable across parsers.
 */
export function signingPayload(timestampSeconds: number, rawBody: string): string {
  return `${timestampSeconds}.${rawBody}`;
}

export function computeSignature(secret: string, timestampSeconds: number, rawBody: string): string {
  return createHmac('sha256', secret).update(signingPayload(timestampSeconds, rawBody), 'utf8').digest('hex');
}

/** Header value, e.g. `sha256=ab12...`. The scheme prefix leaves room to rotate. */
export function signatureHeaderValue(secret: string, timestampSeconds: number, rawBody: string): string {
  return `sha256=${computeSignature(secret, timestampSeconds, rawBody)}`;
}

export interface VerifyInput {
  secret: string;
  rawBody: string;
  /** Value of the `x-basepay-timestamp` header. */
  timestamp: string | number;
  /** Value of the `x-basepay-signature` header. */
  signature: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}

/**
 * Reference verifier — the README points merchants at this exact logic.
 * Constant-time comparison, and a bounded timestamp window in both directions.
 */
export function verifySignature(input: VerifyInput): boolean {
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  const timestamp = typeof input.timestamp === 'number' ? input.timestamp : Number(input.timestamp);
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) return false;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const presented = input.signature.startsWith('sha256=') ? input.signature.slice('sha256='.length) : input.signature;
  if (!/^[0-9a-f]+$/i.test(presented)) return false;

  const expected = Buffer.from(computeSignature(input.secret, timestamp, input.rawBody), 'hex');
  const actual = Buffer.from(presented.toLowerCase(), 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
