import { getAddress } from 'viem';
import { badRequest } from './errors.js';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Validates and returns the EIP-55 checksummed form.
 *
 * An all-lowercase or all-uppercase address is accepted and normalised (those are
 * valid unchecksummed representations). A mixed-case address must match its own
 * checksum — mixed case means someone intended a checksum, and a mismatch there
 * is a typo, which for a payout address is money sent into the void.
 */
export function normalizeAddress(value: string, field = 'address'): string {
  if (typeof value !== 'string' || !HEX_ADDRESS.test(value)) {
    throw badRequest('INVALID_ADDRESS', `${field} must be a 0x-prefixed 20-byte hex address`);
  }
  const checksummed = getAddress(value as `0x${string}`);
  // Compare the hex body only: the "0x" prefix is conventionally lowercase even
  // in an otherwise all-uppercase address.
  const body = value.slice(2);
  const caseless = body === body.toLowerCase() || body === body.toUpperCase();
  if (!caseless && value !== checksummed) {
    throw badRequest('INVALID_ADDRESS', `${field} failed its EIP-55 checksum; check for a typo`);
  }
  return checksummed;
}
