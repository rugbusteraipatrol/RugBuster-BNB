import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl } from '../src/apiBase.js';

describe('normalizeApiBaseUrl', () => {
  it('moves the bare domain, which only redirects, to www', () => {
    expect(normalizeApiBaseUrl('https://stablecart.org')).toBe('https://www.stablecart.org');
    expect(normalizeApiBaseUrl('https://stablecart.org/')).toBe('https://www.stablecart.org');
  });

  it('keeps any path the base carries', () => {
    expect(normalizeApiBaseUrl('https://stablecart.org/pay')).toBe('https://www.stablecart.org/pay');
  });

  it('leaves other hosts alone', () => {
    expect(normalizeApiBaseUrl('https://www.stablecart.org')).toBe('https://www.stablecart.org');
    expect(normalizeApiBaseUrl('https://basepay-production.up.railway.app/')).toBe(
      'https://basepay-production.up.railway.app',
    );
    expect(normalizeApiBaseUrl('http://localhost:8080')).toBe('http://localhost:8080');
  });

  it('passes through a value that is not a URL', () => {
    expect(normalizeApiBaseUrl('/api-proxy/')).toBe('/api-proxy');
  });
});
