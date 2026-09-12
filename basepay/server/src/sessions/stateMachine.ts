import type { SessionStatus } from '../db/types.js';

/**
 * Session lifecycle. Deliberately small and explicit — every edge here is a place
 * money can be mis-attributed, so nothing is implicit.
 *
 *   pending ──(exact transfer seen, 1 conf)──▶ confirming ──(N confs)──▶ paid
 *      │                                           │
 *      │                                           └──(reorg: tx no longer canonical)──▶ pending
 *      ├──(transfer below the quote)──▶ underpaid
 *      └──(deadline passed)──▶ expired
 *
 * `confirming` never expires: funds are already in flight, so the session must be
 * allowed to reach a terminal state.
 */
const TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = Object.freeze({
  pending: ['confirming', 'underpaid', 'expired'],
  confirming: ['paid', 'pending'],
  paid: [],
  underpaid: [],
  expired: [],
});

export const TERMINAL_STATUSES: readonly SessionStatus[] = ['paid', 'underpaid', 'expired'];

/** Statuses that still hold an amount reservation and are still watched on-chain. */
export const OPEN_STATUSES: readonly SessionStatus[] = ['pending', 'confirming'];

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isOpen(status: SessionStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: SessionStatus): readonly SessionStatus[] {
  return TRANSITIONS[from];
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: SessionStatus,
    readonly to: SessionStatus,
  ) {
    super(`Invalid session transition ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/**
 * The statuses a transition to `to` may legally start from. Used to build the
 * `WHERE status = ANY(...)` guard so the database enforces the same rules under
 * concurrency that this module enforces in memory.
 */
export function sourcesFor(to: SessionStatus): readonly SessionStatus[] {
  return (Object.keys(TRANSITIONS) as SessionStatus[]).filter((from) => canTransition(from, to));
}
