/**
 * Attribution: deciding which open session (if any) an observed USDC transfer
 * belongs to. Pure, so it can be tested exhaustively — this is the single place
 * where a bug silently sends a buyer's money into the void.
 *
 * The primary key is the exact amount. Every open session of a merchant is
 * quoted a distinct micro-USDC amount, so `(to, value)` identifies a session.
 *
 * The tolerance paths exist because a wallet pays the exact quote but a fiat
 * on-ramp does not: it delivers roughly the requested amount, minus fees or
 * rounded to its own precision. Those paths only ever fire when exactly one open
 * session could plausibly be meant. Ambiguity is never guessed — an ambiguous
 * transfer is recorded unmatched and surfaced to the operator instead.
 */

/** Ratios are held as integers scaled by RATIO_SCALE so no float touches an amount. */
export const RATIO_SCALE = 1_000_000n;

export interface MatchableSession {
  id: string;
  amountUsdc: bigint;
  /**
   * Whether the near-miss paths may attribute to this session. The watcher sets
   * it only for `pending` sessions: once a session is `confirming`, its exact
   * transfer has already been seen and a second, differently-sized transfer is
   * far more likely to be someone else's money than a correction to this one.
   * Defaults to true so callers that do not care can ignore it.
   */
  toleranceEligible?: boolean;
}

export interface MatchOptions {
  /** A transfer below the quote attributes only if value >= quote * this. */
  underpayMinRatioScaled: bigint;
  /** A transfer above the quote attributes only if value <= quote * this. */
  overpayMaxRatioScaled: bigint;
}

export type MatchResult<S extends MatchableSession> =
  | { kind: 'exact'; session: S }
  | { kind: 'underpaid'; session: S; shortfall: bigint }
  | { kind: 'overpaid'; session: S; excess: bigint }
  | { kind: 'unmatched'; reason: 'no-candidates' | 'ambiguous'; candidateIds: string[] };

export function ratioToScaled(ratio: number): bigint {
  if (!Number.isFinite(ratio) || ratio < 0) throw new Error('ratio must be a non-negative finite number');
  return BigInt(Math.round(ratio * Number(RATIO_SCALE)));
}

/**
 * The range of quotes a transfer of `value` could possibly belong to. Used to
 * bound the candidate query; the decision itself is made by `matchTransfer`.
 *
 *   value >= quote * underpayMin   =>  quote <= value / underpayMin
 *   value <= quote * overpayMax    =>  quote >= value / overpayMax
 */
export function quoteWindow(value: bigint, options: MatchOptions): { minQuote: bigint; maxQuote: bigint } {
  const minQuote =
    options.overpayMaxRatioScaled === 0n
      ? value
      : ceilDiv(value * RATIO_SCALE, options.overpayMaxRatioScaled);
  const maxQuote =
    options.underpayMinRatioScaled === 0n
      ? // No lower bound configured: any quote at or above the value is a candidate.
        value * RATIO_SCALE
      : (value * RATIO_SCALE) / options.underpayMinRatioScaled;
  return { minQuote, maxQuote };
}

/**
 * @param value      micro-USDC actually transferred
 * @param candidates open sessions for the receiving address (any quote)
 */
export function matchTransfer<S extends MatchableSession>(
  value: bigint,
  candidates: readonly S[],
  options: MatchOptions,
): MatchResult<S> {
  const exact = candidates.filter((c) => c.amountUsdc === value);
  // The open-amount reservation makes >1 exact match impossible per merchant; if
  // two merchants somehow share an address, the oldest session still wins
  // deterministically rather than the transfer going unattributed.
  if (exact[0]) return { kind: 'exact', session: exact[0] };

  const tolerated = candidates.filter(
    (c) => c.toleranceEligible !== false && withinTolerance(value, c.amountUsdc, options),
  );
  if (tolerated.length === 0) {
    return { kind: 'unmatched', reason: 'no-candidates', candidateIds: [] };
  }
  if (tolerated.length > 1) {
    return { kind: 'unmatched', reason: 'ambiguous', candidateIds: tolerated.map((c) => c.id) };
  }

  const session = tolerated[0] as S;
  return value < session.amountUsdc
    ? { kind: 'underpaid', session, shortfall: session.amountUsdc - value }
    : { kind: 'overpaid', session, excess: value - session.amountUsdc };
}

function withinTolerance(value: bigint, quote: bigint, options: MatchOptions): boolean {
  if (value === quote) return true;
  if (value < quote) {
    if (options.underpayMinRatioScaled === 0n) return true;
    return value * RATIO_SCALE >= quote * options.underpayMinRatioScaled;
  }
  if (options.overpayMaxRatioScaled <= RATIO_SCALE) return false;
  return value * RATIO_SCALE <= quote * options.overpayMaxRatioScaled;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}
