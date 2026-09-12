import { describe, expect, it } from 'vitest';
import {
  allocateOffset,
  formatScaled,
  formatUsd,
  formatUsdc,
  OffsetExhaustedError,
  offsetWindowUsdc,
  parseDecimalToScaled,
  parseUsdToCents,
  usdCentsToUsdcMicro,
} from '../../src/sessions/amounts.js';

describe('parseDecimalToScaled', () => {
  it('scales whole and fractional parts exactly', () => {
    expect(parseDecimalToScaled('45', 6)).toBe(45_000_000n);
    expect(parseDecimalToScaled('45.000123', 6)).toBe(45_000_123n);
    expect(parseDecimalToScaled('0.000001', 6)).toBe(1n);
    expect(parseDecimalToScaled('1.00000000', 8)).toBe(100_000_000n);
  });

  it('refuses to silently truncate excess precision', () => {
    expect(() => parseDecimalToScaled('45.0000001', 6)).toThrow(/more than 6 decimal places/);
  });

  it('rejects things that are not decimal numbers', () => {
    for (const bad of ['', 'abc', '1.2.3', '1e6', '0x10', ' ']) {
      expect(() => parseDecimalToScaled(bad, 6)).toThrow();
    }
  });

  it('round-trips through formatScaled', () => {
    for (const value of ['0.000000', '1.000000', '45.000999', '999999.123456']) {
      expect(formatScaled(parseDecimalToScaled(value, 6), 6)).toBe(value);
    }
  });
});

describe('parseUsdToCents', () => {
  it('accepts strings and numbers at cent precision', () => {
    expect(parseUsdToCents('45.00')).toBe(4500n);
    expect(parseUsdToCents('45')).toBe(4500n);
    expect(parseUsdToCents(45)).toBe(4500n);
    expect(parseUsdToCents(0.01)).toBe(1n);
    expect(parseUsdToCents(19.99)).toBe(1999n);
  });

  it('rejects sub-cent precision rather than rounding money away', () => {
    expect(() => parseUsdToCents('45.001')).toThrow();
    expect(() => parseUsdToCents(45.001)).toThrow();
  });

  it('rejects zero, negatives and nonsense', () => {
    expect(() => parseUsdToCents('0')).toThrow(/greater than zero/);
    expect(() => parseUsdToCents('-5.00')).toThrow(/greater than zero/);
    expect(() => parseUsdToCents(Number.NaN)).toThrow();
    expect(() => parseUsdToCents(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('usdCentsToUsdcMicro', () => {
  it('converts at parity', () => {
    expect(usdCentsToUsdcMicro(4500n, '1.00000000')).toBe(45_000_000n);
    expect(usdCentsToUsdcMicro(1n, '1.00000000')).toBe(10_000n);
  });

  it('applies an off-peg price', () => {
    // $45.00 at $0.999 per USDC needs slightly more than 45 USDC.
    expect(usdCentsToUsdcMicro(4500n, '0.99900000')).toBe(45_045_045n);
    expect(usdCentsToUsdcMicro(4500n, '1.00100000')).toBe(44_955_045n);
  });

  it('rounds half up and never loses more than one micro-unit', () => {
    const price = '0.99970000';
    const micro = usdCentsToUsdcMicro(4500n, price);
    const exact = (4500n * 10n ** 12n) / 99_970_000n;
    expect(micro - exact).toBeLessThanOrEqual(1n);
  });

  it('rejects a non-positive price rather than dividing by zero', () => {
    expect(() => usdCentsToUsdcMicro(4500n, '0.00000000')).toThrow(/must be positive/);
  });
});

describe('allocateOffset', () => {
  const base = 45_000_000n;

  it('gives the lowest free slot so quotes stay closest to the true price', () => {
    expect(allocateOffset(base, new Set(), 1000)).toBe(0);
    expect(allocateOffset(base, new Set([base]), 1000)).toBe(1);
    expect(allocateOffset(base, new Set([base, base + 1n, base + 2n]), 1000)).toBe(3);
  });

  it('fills a gap left by a settled session', () => {
    const taken = new Set([base, base + 2n, base + 3n]);
    expect(allocateOffset(base, taken, 1000)).toBe(1);
  });

  it('is deterministic for the same inputs', () => {
    const taken = new Set([base, base + 1n]);
    expect(allocateOffset(base, taken, 1000)).toBe(allocateOffset(base, taken, 1000));
  });

  it('ignores amounts outside its own window', () => {
    const taken = new Set([base - 1n, base + 5_000n]);
    expect(allocateOffset(base, taken, 1000)).toBe(0);
  });

  it('throws instead of reusing an offset when the window is full', () => {
    const offsetMax = 8;
    const taken = new Set(Array.from({ length: offsetMax }, (_, i) => base + BigInt(i)));
    expect(() => allocateOffset(base, taken, offsetMax)).toThrow(OffsetExhaustedError);
    try {
      allocateOffset(base, taken, offsetMax);
    } catch (err) {
      expect((err as OffsetExhaustedError).offsetMax).toBe(offsetMax);
    }
  });

  it('allocates every slot in a full window exactly once', () => {
    const offsetMax = 50;
    const taken = new Set<bigint>();
    const seen = new Set<number>();
    for (let i = 0; i < offsetMax; i += 1) {
      const offset = allocateOffset(base, taken, offsetMax);
      expect(seen.has(offset)).toBe(false);
      seen.add(offset);
      taken.add(base + BigInt(offset));
    }
    expect(seen.size).toBe(offsetMax);
    expect(() => allocateOffset(base, taken, offsetMax)).toThrow(OffsetExhaustedError);
  });

  it('scans circularly from startAt so racers spread across the window', () => {
    expect(allocateOffset(base, new Set(), 1000, 500)).toBe(500);
    // Wraps past the end of the window rather than giving up.
    const taken = new Set([base + 999n]);
    expect(allocateOffset(base, taken, 1000, 999)).toBe(0);
  });

  it('normalises an out-of-range or negative startAt', () => {
    expect(allocateOffset(base, new Set(), 10, 13)).toBe(3);
    expect(allocateOffset(base, new Set(), 10, -1)).toBe(9);
  });

  it('still finds the one free slot in a nearly full window, whatever the start', () => {
    const offsetMax = 16;
    const free = 7;
    const taken = new Set(
      Array.from({ length: offsetMax }, (_, i) => base + BigInt(i)).filter((a) => a !== base + BigInt(free)),
    );
    for (let startAt = 0; startAt < offsetMax; startAt += 1) {
      expect(allocateOffset(base, taken, offsetMax, startAt)).toBe(free);
    }
  });

  it('requires a window of at least one slot', () => {
    expect(() => allocateOffset(base, new Set(), 0)).toThrow(/at least 1/);
  });
});

describe('formatting', () => {
  it('formats USD cents and USDC micro-units', () => {
    expect(formatUsd(4500n)).toBe('45.00');
    expect(formatUsd(5n)).toBe('0.05');
    expect(formatUsdc(45_000_123n)).toBe('45.000123');
    expect(formatUsdc(0n)).toBe('0.000000');
  });

  it('describes the worst-case overpay of the offset window', () => {
    expect(offsetWindowUsdc(1000)).toBe('0.000999');
    expect(offsetWindowUsdc(1)).toBe('0.000000');
  });
});
