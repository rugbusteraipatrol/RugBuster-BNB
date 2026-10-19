import { describe, expect, it } from 'vitest';
import { messagesFor, resolveLocale } from '../src/i18n.js';

describe('resolveLocale', () => {
  it('recognises Serbian in its common spellings', () => {
    for (const input of ['sr', 'SR', 'sr-Latn', 'sr_RS', ' sr ']) {
      expect(resolveLocale(input)).toBe('sr');
    }
  });

  it('falls back to English for anything else', () => {
    for (const input of [undefined, null, '', 'en', 'de', 'serbian', 'hr']) {
      expect(resolveLocale(input)).toBe('en');
    }
  });
});

describe('messages', () => {
  const en = messagesFor('en');
  const sr = messagesFor('sr');

  it('has the same keys in every language, including every wallet reason', () => {
    expect(Object.keys(sr).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(sr.wallet).sort()).toEqual(Object.keys(en.wallet).sort());
  });

  it('has no empty strings', () => {
    for (const messages of [en, sr]) {
      for (const [key, value] of Object.entries(messages)) {
        if (typeof value === 'string') expect(value.trim(), key).not.toBe('');
      }
      for (const [key, value] of Object.entries(messages.wallet)) expect(value.trim(), key).not.toBe('');
    }
  });

  it('fills amounts into the Serbian copy', () => {
    expect(sr.payUsd('25.00')).toBe('Plati $25.00');
    expect(sr.pendingDetail('25.01')).toContain('25.01 USDC');
    expect(sr.confirmingDetail(1, 3)).toContain('1 od 3');
  });
});
