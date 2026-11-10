/**
 * Whether the background loops may leave the database alone.
 *
 * Neon bills compute by the hour and suspends it only after minutes with no
 * queries. The watcher, the late sweep, the webhook worker and the expiry sweep
 * each queried every few seconds, so a shop with no customers kept the compute
 * awake all month and ran through the free quota.
 *
 * Every piece of work those loops do starts with a session, and sessions are
 * only created through the API. So once the watcher finds nothing open, nothing
 * inside the late-payment window and no webhook waiting, the loops go quiet,
 * and the next API request wakes them before its handler runs.
 */
export class Activity {
  private asleep = false;
  private wokeAt: number | null = null;
  /** Bumped by every request, so a request that lands mid-check cancels the sleep. */
  private requests = 0;

  isAsleep(): boolean {
    return this.asleep;
  }

  /** Taken before checking for pending work; pass it to `sleepIfQuietSince`. */
  mark(): number {
    return this.requests;
  }

  /** Sleeps only if no request arrived since `mark` was taken. */
  sleepIfQuietSince(mark: number): boolean {
    if (this.requests !== mark) return false;
    this.asleep = true;
    return true;
  }

  wake(now: number = Date.now()): void {
    this.requests += 1;
    if (!this.asleep) return;
    this.asleep = false;
    this.wokeAt = now;
  }

  /**
   * When the loops last woke from sleep, cleared on read. The watcher's bookmark
   * stopped moving while asleep, and no payment can precede the request that
   * woke it, so the watcher resumes scanning from about this moment instead.
   */
  takeWokeAt(): number | null {
    const at = this.wokeAt;
    this.wokeAt = null;
    return at;
  }
}
