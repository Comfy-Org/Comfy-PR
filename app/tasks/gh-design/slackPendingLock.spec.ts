/**
 * Spec: slackPending atomic lock in GithubDesignTask
 *
 * WHY this lock exists
 * --------------------
 * The gh-design task runs every 5 minutes via cron. When a run takes longer
 * than 5 minutes (or two runs start simultaneously), multiple concurrent
 * executions can all read `task.slackUrl = null` from MongoDB at the same time,
 * each decide "no message posted yet", and all call `upsertSlackMessage`
 * independently — producing N identical root messages in #product-design.
 *
 * This was observed in production: 5+ identical "🎨 New Design issue" messages
 * posted within 116ms of each other for the same GitHub issue.
 *
 * HOW the lock works
 * ------------------
 * Before calling the Slack API, the task does a single atomic MongoDB operation:
 *
 *   findOneAndUpdate(
 *     { _id, slackUrl: $exists:false, $or: [pending≠true | pendingAt < 10min ago] },
 *     { $set: { slackPending: true, slackPendingAt: now } }
 *   )
 *
 * MongoDB guarantees this is atomic at the document level. Only ONE concurrent
 * caller can match the filter and acquire the lock. The rest get null back and
 * skip posting. The winner posts the message, saves the slackUrl, and clears
 * the lock. If the winner crashes, the lock auto-expires after 10 minutes so
 * the next run can retry.
 *
 * These tests verify the lock logic in isolation without needing a real MongoDB
 * or Slack connection.
 */

import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Inline model of the lock logic so tests don't need real MongoDB/Slack
// ---------------------------------------------------------------------------

type LockState = {
  slackUrl?: string;
  slackPending?: boolean;
  slackPendingAt?: Date;
};

/** Returns true if the caller acquired the lock (may post). False = skip. */
function tryAcquireLock(state: LockState, now: Date, staleCutoffMs = 10 * 60 * 1000): boolean {
  // Already has a slackUrl — no lock needed (message exists)
  if (state.slackUrl) return false;

  const staleCutoff = new Date(now.getTime() - staleCutoffMs);
  const lockIsFresh =
    state.slackPending === true &&
    state.slackPendingAt !== undefined &&
    state.slackPendingAt >= staleCutoff;

  if (lockIsFresh) return false; // another run holds a fresh lock

  // Acquire
  state.slackPending = true;
  state.slackPendingAt = now;
  return true;
}

function releaseLock(state: LockState, slackUrl?: string, error?: string) {
  state.slackPending = false;
  if (slackUrl) state.slackUrl = slackUrl;
  if (error) (state as any).error = error;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("slackPending lock — prevents concurrent duplicate Slack posts", () => {
  it("acquires the lock when no message has been posted and no lock is held", () => {
    const state: LockState = {};
    const acquired = tryAcquireLock(state, new Date());
    expect(acquired).toBe(true);
    expect(state.slackPending).toBe(true);
    expect(state.slackPendingAt).toBeInstanceOf(Date);
  });

  it("second concurrent caller cannot acquire the lock while first holds it", () => {
    const state: LockState = {};
    const now = new Date();

    const firstAcquired = tryAcquireLock(state, now);
    const secondAcquired = tryAcquireLock(state, now); // same document, concurrent

    expect(firstAcquired).toBe(true);
    expect(secondAcquired).toBe(false); // skips posting
  });

  it("does not acquire the lock when slackUrl is already set (message exists)", () => {
    const state: LockState = { slackUrl: "https://slack.com/archives/C123/p456" };
    const acquired = tryAcquireLock(state, new Date());
    expect(acquired).toBe(false);
  });

  it("allows re-acquisition when the previous lock is stale (>10 min old)", () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
    const state: LockState = { slackPending: true, slackPendingAt: elevenMinutesAgo };

    const acquired = tryAcquireLock(state, new Date());
    expect(acquired).toBe(true); // stale lock reclaimed
  });

  it("does NOT re-acquire when the lock is still fresh (< 10 min old)", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const state: LockState = { slackPending: true, slackPendingAt: fiveMinutesAgo };

    const acquired = tryAcquireLock(state, new Date());
    expect(acquired).toBe(false); // another run is still in-flight
  });

  it("lock boundary: exactly at stale cutoff is still treated as fresh (strict <)", () => {
    const staleCutoffMs = 10 * 60 * 1000;
    const exactly10MinAgo = new Date(Date.now() - staleCutoffMs);
    const state: LockState = { slackPending: true, slackPendingAt: exactly10MinAgo };

    const acquired = tryAcquireLock(state, new Date(), staleCutoffMs);
    // The MongoDB query uses $lt (strict less-than), so pendingAt == staleCutoff
    // does NOT satisfy the stale condition → lock is still considered fresh → skip
    expect(acquired).toBe(false);
  });

  it("releases lock and saves slackUrl on successful post", () => {
    const state: LockState = { slackPending: true, slackPendingAt: new Date() };
    releaseLock(state, "https://slack.com/archives/C123/p789");

    expect(state.slackPending).toBe(false);
    expect(state.slackUrl).toBe("https://slack.com/archives/C123/p789");
  });

  it("releases lock without slackUrl on failed post (so next run retries)", () => {
    const state: LockState = { slackPending: true, slackPendingAt: new Date() };
    releaseLock(state, undefined, "API error");

    expect(state.slackPending).toBe(false);
    expect(state.slackUrl).toBeUndefined(); // no URL saved, next run will retry
    expect((state as any).error).toBe("API error");
  });

  it("N concurrent callers: exactly one acquires the lock", () => {
    // Simulate N concurrent callers all reading the same initial state
    // MongoDB's atomic findOneAndUpdate guarantees only one succeeds;
    // we model that here by processing callers sequentially against shared state.
    const state: LockState = {};
    const now = new Date();
    const N = 10;

    const results = Array.from({ length: N }, () => tryAcquireLock(state, now));
    const acquired = results.filter(Boolean);

    expect(acquired).toHaveLength(1); // exactly one caller posts
    expect(results.filter((r) => !r)).toHaveLength(N - 1); // rest skip
  });
});
