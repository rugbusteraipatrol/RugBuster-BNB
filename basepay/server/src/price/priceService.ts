import { unavailable } from '../errors.js';
import { logger } from '../logger.js';

export interface PriceQuote {
  /** USD per 1 USDC, as a decimal string. */
  priceUsd: string;
  fetchedAt: Date;
  ageSeconds: number;
  /** True when the upstream is failing and this is the last good price. */
  stale: boolean;
}

export interface PriceServiceOptions {
  fetchPrice: () => Promise<string>;
  /** Below this age the cached price is served without hitting the upstream. */
  cacheTtlSeconds: number;
  /** Above this age we refuse to quote at all rather than quote a wrong price. */
  maxStaleSeconds: number;
  /** After a failed refresh the upstream is not asked again for this long. Default: 30 */
  retryAfterFailureSeconds?: number;
  now?: () => number;
}

/**
 * Price cache with an explicit staleness policy:
 *
 *   age <= cacheTtl              -> serve cached, fresh
 *   upstream ok                  -> serve new price, fresh
 *   upstream down, age <= maxStale -> serve last good price, flagged stale
 *   upstream down, age >  maxStale -> refuse (PRICE_UNAVAILABLE)
 *
 * Refusing is the correct failure mode: a wrong quote either shortchanges the
 * merchant or overcharges the buyer, and neither is recoverable once paid.
 *
 * A failed refresh starts a cool-down in which the upstream counts as down
 * without being asked. Every checkout and every hit on the public /readyz asks
 * for a quote. Without the cool-down, an upstream answering HTTP 429 would be
 * asked again on each of those requests, and a brief rate limit would never lift.
 */
export class PriceService {
  private cached: { priceUsd: string; fetchedAtMs: number } | null = null;
  private inFlight: Promise<void> | null = null;
  private lastFailureAtMs: number | null = null;
  private readonly now: () => number;
  private readonly retryAfterFailureSeconds: number;

  constructor(private readonly options: PriceServiceOptions) {
    this.now = options.now ?? Date.now;
    this.retryAfterFailureSeconds = options.retryAfterFailureSeconds ?? 30;
  }

  /** Seeds the cache. Used by tests and by warm-start paths. */
  seed(priceUsd: string, fetchedAtMs: number = this.now()): void {
    this.cached = { priceUsd, fetchedAtMs };
  }

  async getQuote(): Promise<PriceQuote> {
    const cached = this.cached;
    if (cached && this.ageSeconds(cached.fetchedAtMs) <= this.options.cacheTtlSeconds) {
      return this.toQuote(cached, false);
    }

    const coolingDown =
      this.lastFailureAtMs !== null && this.ageSeconds(this.lastFailureAtMs) < this.retryAfterFailureSeconds;
    if (!coolingDown) {
      try {
        await this.refresh();
        this.lastFailureAtMs = null;
      } catch (err) {
        this.lastFailureAtMs = this.now();
        logger.warn({ err: (err as Error).message }, 'USDC price refresh failed');
      }
    }

    const current = this.cached;
    if (!current) {
      throw unavailable('PRICE_UNAVAILABLE', 'No USDC price is available yet. Try again shortly.');
    }

    const age = this.ageSeconds(current.fetchedAtMs);
    if (age > this.options.maxStaleSeconds) {
      throw unavailable(
        'PRICE_UNAVAILABLE',
        'The USDC price feed has been unavailable for too long to quote a payment safely.',
        { ageSeconds: age, maxStaleSeconds: this.options.maxStaleSeconds },
      );
    }

    return this.toQuote(current, age > this.options.cacheTtlSeconds);
  }

  /** Non-throwing view for health checks. */
  snapshot(): { priceUsd: string; ageSeconds: number } | null {
    return this.cached
      ? { priceUsd: this.cached.priceUsd, ageSeconds: this.ageSeconds(this.cached.fetchedAtMs) }
      : null;
  }

  /** Collapses concurrent refreshes into one upstream request. */
  private async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const attempt = (async () => {
      const priceUsd = await this.options.fetchPrice();
      this.cached = { priceUsd, fetchedAtMs: this.now() };
    })();
    this.inFlight = attempt.finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private ageSeconds(fetchedAtMs: number): number {
    return Math.max(0, (this.now() - fetchedAtMs) / 1000);
  }

  private toQuote(cached: { priceUsd: string; fetchedAtMs: number }, stale: boolean): PriceQuote {
    return {
      priceUsd: cached.priceUsd,
      fetchedAt: new Date(cached.fetchedAtMs),
      ageSeconds: this.ageSeconds(cached.fetchedAtMs),
      stale,
    };
  }
}
