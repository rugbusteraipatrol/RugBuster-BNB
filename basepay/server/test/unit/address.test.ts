import { describe, expect, it } from 'vitest';
import { normalizeAddress } from '../../src/address.js';

const CHECKSUMMED = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

describe('normalizeAddress', () => {
  it('returns the EIP-55 checksummed form', () => {
    expect(normalizeAddress(CHECKSUMMED)).toBe(CHECKSUMMED);
    expect(normalizeAddress(CHECKSUMMED.toLowerCase())).toBe(CHECKSUMMED);
    expect(normalizeAddress(`0x${CHECKSUMMED.slice(2).toUpperCase()}`)).toBe(CHECKSUMMED);
  });

  it('rejects a mixed-case address that fails its own checksum', () => {
    // One character's case flipped: a typo a merchant would never spot.
    const broken = `0x833589FCD6eDb6E08f4c7C32D4f71b54bdA02913`;
    expect(() => normalizeAddress(broken)).toThrow(/checksum/);
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '0x', 'not an address', CHECKSUMMED.slice(0, -1), `${CHECKSUMMED}00`, CHECKSUMMED.slice(2)]) {
      expect(() => normalizeAddress(bad)).toThrow();
    }
  });

  it('names the field in the error so an operator can find the typo', () => {
    expect(() => normalizeAddress('nope', 'walletAddress')).toThrow(/walletAddress/);
  });
});
