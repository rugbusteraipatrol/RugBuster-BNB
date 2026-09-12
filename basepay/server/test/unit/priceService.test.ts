import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors.js';
import { PriceService } from '../../src/price/priceService.js';

/** Controllable clock so staleness is tested by arithmetic, not by sleeping. */
function clock(startMs = 1_700_000_000_000) {
  let current = startMs;
  return {
    now: () => current,
    advanceSeconds(seconds: number) {
      current += seconds * 1000;
    },
  };
}

const build = (fetchPrice: () => Promise<string>, time = clock()) => ({
  time,
  service: new PriceService({
    fetchPrice,
    cacheTtlSeconds: 60,
    maxStaleSeconds: 600,
    now: time.now,
  }),
});

describe('PriceService', () => {
  it('fetches once and serves the cache inside the TTL', async () => {
    const fetchPrice = vi.fn(async () => '1.00000000');
    const { service, time } = build(fetchPrice);

    const first = await service.getQuote();
    expect(first.priceUsd).toBe('1.00000000');
    expect(first.stale).toBe(false);
    expect(fetchPrice).toHaveBeenCalledTimes(1);

    time.advanceSeconds(59);
    const second = await service.getQuote();
    expect(second.stale).toBe(false);
    expect(fetchPrice).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the TTL has passed', async () => {
    const prices = ['1.00000000', '0.99900000'];
    const fetchPrice = vi.fn(async () => prices.shift() ?? '0.99800000');
    const { service, time } = build(fetchPrice);

    await service.getQuote();
    time.advanceSeconds(61);
    const refreshed = await service.getQuote();

    expect(refreshed.priceUsd).toBe('0.99900000');
    expect(refreshed.stale).toBe(false);
    expect(fetchPrice).toHaveBeenCalledTimes(2);
  });

  it('serves the last good price, flagged stale, while the upstream is down', async () => {
    let fail = false;
    const fetchPrice = vi.fn(async () => {
      if (fail) throw new Error('CoinGecko returned HTTP 502');
      return '1.00000000';
    });
    const { service, time } = build(fetchPrice);

    await service.getQuote();
    fail = true;
    time.advanceSeconds(120);

    const quote = await service.getQuote();
    expect(quote.priceUsd).toBe('1.00000000');
    expect(quote.stale).toBe(true);
    expect(quote.ageSeconds).toBe(120);
  });

  it('refuses to quote once the last good price is older than the stale ceiling', async () => {
    let fail = false;
    const fetchPrice = vi.fn(async () => {
      if (fail) throw new Error('network down');
      return '1.00000000';
    });
    const { service, time } = build(fetchPrice);

    await service.getQuote();
    fail = true;

    time.advanceSeconds(600);
    await expect(service.getQuote()).resolves.toMatchObject({ stale: true });

    time.advanceSeconds(1);
    await expect(service.getQuote()).rejects.toMatchObject({ code: 'PRICE_UNAVAILABLE', statusCode: 503 });
  });

  it('recovers cleanly when the upstream comes back', async () => {
    let fail = false;
    const fetchPrice = vi.fn(async () => {
      if (fail) throw new Error('down');
      return '1.00000000';
    });
    const { service, time } = build(fetchPrice);

    await service.getQuote();
    fail = true;
    time.advanceSeconds(700);
    await expect(service.getQuote()).rejects.toThrow(AppError);

    fail = false;
    const recovered = await service.getQuote();
    expect(recovered.stale).toBe(false);
    expect(recovered.ageSeconds).toBe(0);
  });

  it('refuses with no price at all rather than inventing one', async () => {
    const { service } = build(async () => {
      throw new Error('down from the start');
    });
    await expect(service.getQuote()).rejects.toMatchObject({ code: 'PRICE_UNAVAILABLE' });
  });

  it('collapses concurrent refreshes into a single upstream request', async () => {
    let resolveFetch: ((value: string) => void) | undefined;
    const fetchPrice = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { service } = build(fetchPrice);

    const quotes = Promise.all([service.getQuote(), service.getQuote(), service.getQuote()]);
    await vi.waitFor(() => expect(resolveFetch).toBeDefined());
    resolveFetch?.('1.00000000');

    const results = await quotes;
    expect(fetchPrice).toHaveBeenCalledTimes(1);
    for (const quote of results) expect(quote.priceUsd).toBe('1.00000000');
  });

  it('exposes a non-throwing snapshot for health checks', async () => {
    const { service, time } = build(async () => '1.00010000');
    expect(service.snapshot()).toBeNull();

    await service.getQuote();
    time.advanceSeconds(30);

    expect(service.snapshot()).toEqual({ priceUsd: '1.00010000', ageSeconds: 30 });
  });
});
