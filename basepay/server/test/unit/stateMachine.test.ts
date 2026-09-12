import { describe, expect, it } from 'vitest';
import type { SessionStatus } from '../../src/db/types.js';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isOpen,
  isTerminal,
  sourcesFor,
} from '../../src/sessions/stateMachine.js';

const ALL: SessionStatus[] = ['pending', 'confirming', 'paid', 'underpaid', 'expired'];

describe('session state machine', () => {
  it('allows exactly the documented transitions', () => {
    const allowed = new Set([
      'pending->confirming',
      'pending->underpaid',
      'pending->expired',
      'confirming->paid',
      'confirming->pending',
    ]);

    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to), `${from}->${to}`).toBe(allowed.has(`${from}->${to}`));
      }
    }
  });

  it('never lets a session leave a terminal state', () => {
    for (const terminal of ['paid', 'underpaid', 'expired'] as const) {
      expect(isTerminal(terminal)).toBe(true);
      expect(allowedTransitions(terminal)).toHaveLength(0);
      for (const to of ALL) expect(canTransition(terminal, to)).toBe(false);
    }
  });

  it('treats only pending and confirming as open', () => {
    expect(isOpen('pending')).toBe(true);
    expect(isOpen('confirming')).toBe(true);
    for (const terminal of ['paid', 'underpaid', 'expired'] as const) {
      expect(isOpen(terminal)).toBe(false);
      expect(isTerminal(terminal)).toBe(true);
    }
  });

  it('never expires a confirming session: money is already in flight', () => {
    expect(canTransition('confirming', 'expired')).toBe(false);
    expect(sourcesFor('expired')).toEqual(['pending']);
  });

  it('allows a reorg to walk confirming back to pending, but not to un-pay', () => {
    expect(canTransition('confirming', 'pending')).toBe(true);
    expect(canTransition('paid', 'pending')).toBe(false);
  });

  it('has no self-transitions', () => {
    for (const status of ALL) expect(canTransition(status, status)).toBe(false);
  });

  it('derives the source set used as the database guard', () => {
    expect(sourcesFor('confirming')).toEqual(['pending']);
    expect(sourcesFor('paid')).toEqual(['confirming']);
    expect(sourcesFor('underpaid')).toEqual(['pending']);
    expect(sourcesFor('pending')).toEqual(['confirming']);
  });

  it('throws a typed error on an illegal transition', () => {
    expect(() => assertTransition('paid', 'pending')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('pending', 'confirming')).not.toThrow();
    try {
      assertTransition('expired', 'paid');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as InvalidTransitionError).from).toBe('expired');
      expect((err as InvalidTransitionError).to).toBe('paid');
    }
  });
});
