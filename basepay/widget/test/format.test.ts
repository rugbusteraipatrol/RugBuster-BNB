import { describe, expect, it } from 'vitest';
import { formatCountdown, trimUsdc, truncateAddress, truncateHash } from '../src/format.js';

describe('formatCountdown', () => {
  it('renders minutes and zero-padded seconds', () => {
    expect(formatCountdown(15 * 60 * 1000)).toBe('15:00');
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(9_000)).toBe('0:09');
  });

  it('clamps at zero so an expired quote never counts upward', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5_000)).toBe('0:00');
  });
});

describe('trimUsdc', () => {
  it('keeps at least cents and drops meaningless trailing zeros', () => {
    expect(trimUsdc('45.000000')).toBe('45.00');
    expect(trimUsdc('45.001230')).toBe('45.00123');
    expect(trimUsdc('45.000001')).toBe('45.000001');
    expect(trimUsdc('0.500000')).toBe('0.50');
  });

  it('leaves an integer string alone', () => {
    expect(trimUsdc('45')).toBe('45');
  });
});

describe('truncation', () => {
  it('keeps the ends of an address, which is what people actually check', () => {
    expect(truncateAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe('0x7099…79C8');
    expect(truncateAddress('0x1234')).toBe('0x1234');
  });

  it('shortens a transaction hash', () => {
    const hash = `0x${'ab'.repeat(32)}`;
    expect(truncateHash(hash)).toBe('0xabababab…ababab');
    expect(truncateHash('0xabc')).toBe('0xabc');
  });
});
