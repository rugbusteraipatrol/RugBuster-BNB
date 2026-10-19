import { describe, expect, it } from 'vitest';
import { Activity } from '../../src/activity.js';

describe('Activity', () => {
  it('starts awake and sleeps once nothing interrupted the check', () => {
    const activity = new Activity();
    expect(activity.isAsleep()).toBe(false);

    const mark = activity.mark();
    expect(activity.sleepIfQuietSince(mark)).toBe(true);
    expect(activity.isAsleep()).toBe(true);
  });

  it('does not sleep when a request arrived during the check', () => {
    const activity = new Activity();
    const mark = activity.mark();
    activity.wake(); // a checkout lands between the query and the decision
    expect(activity.sleepIfQuietSince(mark)).toBe(false);
    expect(activity.isAsleep()).toBe(false);
  });

  it('reports when it woke, once', () => {
    const activity = new Activity();
    activity.sleepIfQuietSince(activity.mark());
    activity.wake(1_000);

    expect(activity.isAsleep()).toBe(false);
    expect(activity.takeWokeAt()).toBe(1_000);
    expect(activity.takeWokeAt()).toBeNull();
  });

  it('records no wake time for requests while already awake', () => {
    const activity = new Activity();
    activity.wake(1_000);
    expect(activity.takeWokeAt()).toBeNull();
  });
});
