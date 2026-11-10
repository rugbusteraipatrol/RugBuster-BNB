import type { ApiError, SessionView } from './types.js';

export class BasePayApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BasePayApiError';
  }
}

async function parseError(response: Response): Promise<BasePayApiError> {
  try {
    const body = (await response.json()) as { error?: ApiError };
    if (body.error?.code) return new BasePayApiError(body.error.code, body.error.message);
  } catch {
    // Fall through to the generic message below.
  }
  return new BasePayApiError('HTTP_ERROR', `The payment service returned an error (HTTP ${response.status}).`);
}

export async function createSession(
  apiBaseUrl: string,
  body: { merchantId: string; amountUsd: string; orderRef: string | null },
): Promise<SessionView> {
  const response = await fetch(`${apiBaseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      merchantId: body.merchantId,
      amountUsd: body.amountUsd,
      ...(body.orderRef ? { orderRef: body.orderRef } : {}),
    }),
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as SessionView;
}

export async function getSession(apiBaseUrl: string, sessionId: string): Promise<SessionView> {
  const response = await fetch(`${apiBaseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as SessionView;
}
