import { z } from 'zod';

const responseSchema = z.object({
  'usd-coin': z.object({ usd: z.number().positive().finite() }),
});

export interface CoinGeckoOptions {
  baseUrl: string;
  apiKey: string | undefined;
  timeoutMs: number;
}

/**
 * Returns the USD price of 1 USDC as a decimal string (never a float, so the
 * quote that reaches the database is exactly what the upstream reported).
 */
export async function fetchUsdcPriceUsd(options: CoinGeckoOptions): Promise<string> {
  const url = new URL(`${options.baseUrl.replace(/\/$/, '')}/simple/price`);
  url.searchParams.set('ids', 'usd-coin');
  url.searchParams.set('vs_currencies', 'usd');

  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.apiKey) headers['x-cg-demo-api-key'] = options.apiKey;

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`CoinGecko returned HTTP ${response.status}`);
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('CoinGecko response did not contain a usable usd-coin price');
  }

  // Clamp to 8dp; CoinGecko reports ~1.0 with a handful of significant digits.
  return parsed.data['usd-coin'].usd.toFixed(8);
}
