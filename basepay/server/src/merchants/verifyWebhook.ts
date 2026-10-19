import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { badRequest } from '../errors.js';
import { logger } from '../logger.js';
import { signatureHeaderValue, signedHeaders } from '../webhooks/signature.js';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const CHALLENGE_TIMEOUT_MS = 10_000;

/**
 * Hosts a self-registering merchant may not point a webhook at. The challenge
 * below makes this service POST to a URL the caller chose, so the usual SSRF
 * targets are refused up front. Production also insists on https.
 */
export function assertPublicWebhookUrl(raw: string, production: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('INVALID_WEBHOOK_URL', 'webhookUrl must be an absolute URL');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !production)) {
    throw badRequest('INVALID_WEBHOOK_URL', 'webhookUrl must use https');
  }
  if (url.username || url.password) {
    throw badRequest('INVALID_WEBHOOK_URL', 'webhookUrl must not contain credentials');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (production && isPrivateHost(host)) {
    throw badRequest('INVALID_WEBHOOK_URL', 'webhookUrl must be publicly reachable');
  }
  return url;
}

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  const version = isIP(host);
  if (version === 4) {
    const [a = 0, b = 0] = host.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (version === 6) {
    return host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  }
  return false;
}

/**
 * Proves the registrant controls the webhook endpoint and that it verifies
 * signatures: we POST a signed `merchant.verify` event carrying a random
 * challenge, and the endpoint must answer 2xx with the same challenge in its
 * body. Only the holder of `webhookSecret` can validate what we sent, so an
 * echo is proof of both reachability and possession.
 */
export async function verifyWebhookEndpoint(
  url: string,
  webhookSecret: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<void> {
  const challenge = randomUUID();
  const deliveryId = randomUUID();
  const body = JSON.stringify({
    id: deliveryId,
    type: 'merchant.verify',
    createdAt: new Date().toISOString(),
    data: { challenge },
  });
  const timestamp = Math.floor(Date.now() / 1000);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'BasePay-Webhooks/1.0',
        ...signedHeaders(signatureHeaderValue(webhookSecret, timestamp, body), timestamp, 'merchant.verify', deliveryId),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(CHALLENGE_TIMEOUT_MS),
    });
  } catch (err) {
    logger.info({ err: (err as Error).message }, 'webhook verification request failed');
    throw badRequest('WEBHOOK_UNREACHABLE', 'Could not reach webhookUrl. Check that the site is public and try again.');
  }

  if (response.status < 200 || response.status >= 300) {
    throw badRequest('WEBHOOK_REJECTED', `webhookUrl answered HTTP ${response.status} to the verification event`);
  }

  const text = (await response.text()).slice(0, 4096);
  let echoed: unknown = null;
  try {
    echoed = (JSON.parse(text) as { challenge?: unknown }).challenge;
  } catch {
    echoed = text.trim();
  }
  if (echoed !== challenge) {
    throw badRequest(
      'WEBHOOK_CHALLENGE_MISMATCH',
      'webhookUrl did not echo the verification challenge. Its signature check or response is wrong.',
    );
  }
}
