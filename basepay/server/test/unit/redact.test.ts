import { describe, expect, it } from 'vitest';
import { redactDeep, redactUrls } from '../../src/redact.js';

describe('redactUrls', () => {
  it('cuts an RPC URL down to its host, as viem quotes it in an error', () => {
    const message =
      'JSON is not a valid request object.\n\nURL: https://base-mainnet.g.alchemy.com/v2/alch_SECRET123\nRequest body: {}';
    const redacted = redactUrls(message);
    expect(redacted).toBe(
      'JSON is not a valid request object.\n\nURL: https://base-mainnet.g.alchemy.com/[redacted]\nRequest body: {}',
    );
    expect(redacted).not.toContain('alch_SECRET123');
  });

  it('handles websocket URLs', () => {
    expect(redactUrls('socket closed: wss://base-mainnet.g.alchemy.com/v2/KEY')).toBe(
      'socket closed: wss://base-mainnet.g.alchemy.com/[redacted]',
    );
  });

  it('drops the password from a connection string', () => {
    const redacted = redactUrls('connect failed: postgres://basepay:hunter2@db.example.com:5432/basepay?sslmode=require');
    expect(redacted).toBe('connect failed: postgres://db.example.com:5432/[redacted]');
    expect(redacted).not.toContain('hunter2');
  });

  it('keeps a key passed as a query parameter out', () => {
    expect(redactUrls('GET https://rpc.example.com?apikey=abc')).toBe('GET https://rpc.example.com/[redacted]');
  });

  it('leaves a bare origin and plain text alone', () => {
    expect(redactUrls('fetch https://mainnet.base.org failed')).toBe('fetch https://mainnet.base.org failed');
    expect(redactUrls('RPC unavailable')).toBe('RPC unavailable');
  });

  it('redacts every URL in the text', () => {
    expect(redactUrls('https://a.example/k1 then https://b.example/k2')).toBe(
      'https://a.example/[redacted] then https://b.example/[redacted]',
    );
  });
});

describe('redactDeep', () => {
  it('reaches strings nested inside structured log fields', () => {
    const value = {
      type: 'HttpRequestError',
      message: 'URL: https://rpc.example.com/v2/KEY',
      details: { url: 'https://rpc.example.com/v2/KEY', status: 400 },
      metaMessages: ['URL: https://rpc.example.com/v2/KEY'],
    };
    expect(JSON.stringify(redactDeep(value))).not.toContain('KEY');
    expect(redactDeep(value)).toMatchObject({ details: { status: 400 } });
  });

  it('survives circular references', () => {
    const value: Record<string, unknown> = { message: 'https://rpc.example.com/v2/KEY' };
    value['self'] = value;
    expect(redactDeep(value)).toEqual({ message: 'https://rpc.example.com/[redacted]', self: '[circular]' });
  });
});
