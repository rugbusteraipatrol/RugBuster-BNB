import { USDC_DECIMALS } from '../config.js';

/** All money math is integer math. No floats touch an amount anywhere in this file. */

const USD_DECIMALS = 2;
const PRICE_DECIMALS = 8;

const pow10 = (n: number): bigint => 10n ** BigInt(n);

/**
 * Parses a fixed-point decimal string into scaled integer units, rejecting
 * anything with more precision than `decimals` rather than silently truncating.
 */
export function parseDecimalToScaled(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a decimal number: ${value}`);
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  if (fraction.length > decimals) {
    throw new Error(`${value} has more than ${decimals} decimal places`);
  }
  const padded = fraction.padEnd(decimals, '0');
  const scaled = BigInt(whole) * pow10(decimals) + BigInt(padded === '' ? '0' : padded);
  return negative ? -scaled : scaled;
}

export function formatScaled(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = pow10(decimals);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(decimals, '0');
  const body = decimals === 0 ? whole.toString() : `${whole}.${fraction}`;
  return negative ? `-${body}` : body;
}

/** "45.00" or "45" -> 4500n cents. Rejects sub-cent precision. */
export function parseUsdToCents(value: string | number): bigint {
  const asString = typeof value === 'number' ? formatNumberExact(value) : value;
  const cents = parseDecimalToScaled(asString, USD_DECIMALS);
  if (cents <= 0n) throw new Error('Amount must be greater than zero');
  return cents;
}

/** JSON numbers arrive as doubles; refuse anything that is not an exact 2dp value. */
function formatNumberExact(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Amount must be a finite number');
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) > Number.EPSILON * Math.max(1, Math.abs(value))) {
    throw new Error(`${value} has more than 2 decimal places`);
  }
  return rounded.toFixed(2);
}

export const formatUsd = (cents: bigint): string => formatScaled(cents, USD_DECIMALS);
export const formatUsdc = (microUnits: bigint): string => formatScaled(microUnits, USDC_DECIMALS);

/**
 * Converts a USD amount to USDC micro-units at the quoted price (USD per 1 USDC).
 * Rounds half up; the residual is at most one micro-unit ($0.000001).
 */
export function usdCentsToUsdcMicro(amountUsdCents: bigint, usdcPriceUsd: string): bigint {
  const priceScaled = parseDecimalToScaled(usdcPriceUsd, PRICE_DECIMALS);
  if (priceScaled <= 0n) throw new Error('USDC price must be positive');

  // micro = cents / 100 / price * 10^6  ==  cents * 10^(6-2) * 10^PRICE_DECIMALS / priceScaled
  const numerator = amountUsdCents * pow10(USDC_DECIMALS - USD_DECIMALS) * pow10(PRICE_DECIMALS);
  return (numerator + priceScaled / 2n) / priceScaled;
}

export class OffsetExhaustedError extends Error {
  constructor(readonly offsetMax: number) {
    super(
      `No unique payment amount is available for this merchant right now ` +
        `(all ${offsetMax} amount slots near this price are held by open sessions)`,
    );
    this.name = 'OffsetExhaustedError';
  }
}

/**
 * Picks a micro-unit offset `n` in [0, offsetMax) such that `baseAmount + n` is
 * not already reserved by an open session of this merchant.
 *
 * Why an offset at all: a merchant has exactly one static address, so two buyers
 * paying "$45.00" at the same time would produce two identical transfers and there
 * would be no way to tell which session each belongs to. Making every open quote a
 * distinct amount turns `(to, value)` into a unique key.
 *
 * The scan starts at `startAt` and wraps, so it always finds a free slot if one
 * exists. Callers use `startAt = 0` first, which yields the lowest free slot and
 * keeps the quote as close to the true price as possible. On a lost race they
 * retry from a random point instead: with everyone starting at zero, N concurrent
 * checkouts collide N times each, which is how this function was originally
 * written and what the concurrency test caught.
 *
 * @throws OffsetExhaustedError when every slot in the window is taken. We reject
 *   the new session rather than reuse an offset — a reused amount is an
 *   unattributable payment, which is worse than a failed checkout.
 */
export function allocateOffset(
  baseAmount: bigint,
  takenAmounts: ReadonlySet<bigint>,
  offsetMax: number,
  startAt = 0,
): number {
  if (offsetMax < 1) throw new Error('offsetMax must be at least 1');
  const start = ((Math.trunc(startAt) % offsetMax) + offsetMax) % offsetMax;
  for (let probe = 0; probe < offsetMax; probe += 1) {
    const offset = (start + probe) % offsetMax;
    if (!takenAmounts.has(baseAmount + BigInt(offset))) return offset;
  }
  throw new OffsetExhaustedError(offsetMax);
}

/**
 * Ceiling for `allocateOffset`: the number of concurrently open sessions a single
 * merchant can hold at *the same base amount* (plus any neighbouring quote whose
 * own window overlaps this one). At the default offsetMax of 1000 that is 1000
 * concurrent $45.00 checkouts, each quoted somewhere in
 * [45.000000, 45.000999] USDC — a maximum overpay of $0.000999.
 */
export const offsetWindowUsdc = (offsetMax: number): string => formatUsdc(BigInt(offsetMax - 1));
