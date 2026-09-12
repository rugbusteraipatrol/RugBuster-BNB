import { describe, expect, it } from 'vitest';
import {
  matchTransfer,
  quoteWindow,
  ratioToScaled,
  type MatchableSession,
  type MatchOptions,
} from '../../src/sessions/matching.js';

const OPTIONS: MatchOptions = {
  underpayMinRatioScaled: ratioToScaled(0.5),
  overpayMaxRatioScaled: ratioToScaled(1.1),
};

const session = (id: string, amountUsdc: bigint, toleranceEligible = true): MatchableSession => ({
  id,
  amountUsdc,
  toleranceEligible,
});

const QUOTE = 45_000_000n;

describe('matchTransfer', () => {
  it('matches the exact quoted amount', () => {
    const result = matchTransfer(QUOTE, [session('a', QUOTE)], OPTIONS);
    expect(result.kind).toBe('exact');
    expect(result.kind === 'exact' && result.session.id).toBe('a');
  });

  it('picks the right session out of neighbours one micro-unit apart', () => {
    const candidates = [
      session('a', QUOTE),
      session('b', QUOTE + 1n),
      session('c', QUOTE + 2n),
    ];
    for (const [offset, id] of [[0n, 'a'], [1n, 'b'], [2n, 'c']] as const) {
      const result = matchTransfer(QUOTE + offset, candidates, OPTIONS);
      expect(result.kind).toBe('exact');
      expect(result.kind === 'exact' && result.session.id).toBe(id);
    }
  });

  it('prefers an exact match over a tolerated one, even when both exist', () => {
    const candidates = [session('close', QUOTE + 1n), session('exact', QUOTE)];
    const result = matchTransfer(QUOTE, candidates, OPTIONS);
    expect(result.kind).toBe('exact');
    expect(result.kind === 'exact' && result.session.id).toBe('exact');
  });

  it('reports an underpayment with its shortfall', () => {
    const result = matchTransfer(40_000_000n, [session('a', QUOTE)], OPTIONS);
    expect(result.kind).toBe('underpaid');
    expect(result.kind === 'underpaid' && result.shortfall).toBe(5_000_000n);
  });

  it('reports an overpayment with its excess', () => {
    const result = matchTransfer(46_000_000n, [session('a', QUOTE)], OPTIONS);
    expect(result.kind).toBe('overpaid');
    expect(result.kind === 'overpaid' && result.excess).toBe(1_000_000n);
  });

  it('refuses to guess when two open sessions could both be meant', () => {
    const result = matchTransfer(46_000_000n, [session('a', QUOTE), session('b', QUOTE + 100n)], OPTIONS);
    expect(result.kind).toBe('unmatched');
    expect(result.kind === 'unmatched' && result.reason).toBe('ambiguous');
    expect(result.kind === 'unmatched' && result.candidateIds.sort()).toEqual(['a', 'b']);
  });

  it('leaves money unattributed rather than wrong when nothing is close', () => {
    const result = matchTransfer(1_000_000n, [session('a', QUOTE)], OPTIONS);
    expect(result.kind).toBe('unmatched');
    expect(result.kind === 'unmatched' && result.reason).toBe('no-candidates');
  });

  it('rejects an overpayment beyond the tolerance', () => {
    // 10% over is the configured ceiling.
    expect(matchTransfer(49_500_000n, [session('a', QUOTE)], OPTIONS).kind).toBe('overpaid');
    expect(matchTransfer(49_500_001n, [session('a', QUOTE)], OPTIONS).kind).toBe('unmatched');
  });

  it('rejects an underpayment beyond the tolerance', () => {
    expect(matchTransfer(22_500_000n, [session('a', QUOTE)], OPTIONS).kind).toBe('underpaid');
    expect(matchTransfer(22_499_999n, [session('a', QUOTE)], OPTIONS).kind).toBe('unmatched');
  });

  it('does not apply tolerance to a session whose exact transfer was already seen', () => {
    const confirming = session('a', QUOTE, false);
    // A near-miss transfer must not attach to it...
    expect(matchTransfer(46_000_000n, [confirming], OPTIONS).kind).toBe('unmatched');
    // ...but a second exact transfer still belongs to it.
    expect(matchTransfer(QUOTE, [confirming], OPTIONS).kind).toBe('exact');
  });

  it('has no candidates to match against when the address has no open sessions', () => {
    const result = matchTransfer(QUOTE, [], OPTIONS);
    expect(result.kind).toBe('unmatched');
    expect(result.kind === 'unmatched' && result.reason).toBe('no-candidates');
  });

  it('disables both tolerance paths when the ratios say so', () => {
    const strict: MatchOptions = { underpayMinRatioScaled: ratioToScaled(1), overpayMaxRatioScaled: ratioToScaled(1) };
    expect(matchTransfer(QUOTE, [session('a', QUOTE)], strict).kind).toBe('exact');
    expect(matchTransfer(QUOTE - 1n, [session('a', QUOTE)], strict).kind).toBe('unmatched');
    expect(matchTransfer(QUOTE + 1n, [session('a', QUOTE)], strict).kind).toBe('unmatched');
  });
});

describe('quoteWindow', () => {
  it('spans every quote the value could belong to', () => {
    const { minQuote, maxQuote } = quoteWindow(QUOTE, OPTIONS);
    // A quote of 90 USDC would make this a 50% underpayment: still in range.
    expect(maxQuote).toBe(90_000_000n);
    // A quote below ~40.909 would make this more than a 10% overpayment.
    expect(minQuote).toBe(40_909_091n);
  });

  it('contains every quote the matcher would actually tolerate', () => {
    const value = 45_000_000n;
    const { minQuote, maxQuote } = quoteWindow(value, OPTIONS);
    for (const quote of [minQuote, minQuote + 1n, value, maxQuote - 1n, maxQuote]) {
      const result = matchTransfer(value, [session('a', quote)], OPTIONS);
      expect(result.kind, `quote ${quote}`).not.toBe('unmatched');
    }
    for (const quote of [minQuote - 1n, maxQuote + 1n]) {
      const result = matchTransfer(value, [session('a', quote)], OPTIONS);
      expect(result.kind, `quote ${quote}`).toBe('unmatched');
    }
  });
});

describe('ratioToScaled', () => {
  it('scales without floating point drift', () => {
    expect(ratioToScaled(1)).toBe(1_000_000n);
    expect(ratioToScaled(0.5)).toBe(500_000n);
    expect(ratioToScaled(1.1)).toBe(1_100_000n);
    expect(ratioToScaled(0)).toBe(0n);
  });

  it('rejects a nonsense ratio', () => {
    expect(() => ratioToScaled(-1)).toThrow();
    expect(() => ratioToScaled(Number.NaN)).toThrow();
  });
});
