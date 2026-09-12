import { describe, expect, it } from 'vitest';
import { encodeTransfer, toHexChainId } from '../src/wallet.js';

const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('encodeTransfer', () => {
  it('encodes transfer(address,uint256) exactly as the ERC-20 ABI requires', () => {
    const data = encodeTransfer(RECIPIENT, '45000123');

    expect(data).toBe(
      '0xa9059cbb' +
        '00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8' +
        '0000000000000000000000000000000000000000000000000000000002aea5bb',
    );
    // Selector + two 32-byte words.
    expect(data).toHaveLength(2 + 8 + 64 * 2);
  });

  it('produces the same calldata whatever case the address arrives in', () => {
    expect(encodeTransfer(RECIPIENT.toLowerCase(), '1')).toBe(encodeTransfer(RECIPIENT, '1'));
  });

  it('encodes amounts beyond Number.MAX_SAFE_INTEGER without losing precision', () => {
    const huge = '123456789012345678901234567890';
    const data = encodeTransfer(RECIPIENT, huge);
    expect(BigInt(`0x${data.slice(-64)}`)).toBe(BigInt(huge));
  });

  it('refuses a malformed address rather than sending funds nowhere', () => {
    for (const bad of ['0x123', '', 'not-an-address', `${RECIPIENT}00`]) {
      expect(() => encodeTransfer(bad, '1')).toThrow(/invalid recipient/);
    }
  });

  it('refuses a zero or negative amount', () => {
    expect(() => encodeTransfer(RECIPIENT, '0')).toThrow(/positive/);
    expect(() => encodeTransfer(RECIPIENT, '-1')).toThrow(/positive/);
  });
});

describe('toHexChainId', () => {
  it('matches the values wallets expect', () => {
    expect(toHexChainId(8453)).toBe('0x2105');
    expect(toHexChainId(1)).toBe('0x1');
    expect(toHexChainId(31337)).toBe('0x7a69');
  });
});
