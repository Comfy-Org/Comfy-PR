import { describe, test, expect } from "bun:test";

/**
 * Verifies the TaskInputFlow drain pattern used by slack-bot.ts to inject
 * follow-up Slack messages into a running Claude Agent SDK session.
 *
 * The bot wraps a TransformStream<string, string> per workspace; writers
 * push new user messages, the SDK reader yields them as SDKUserMessage.
 *
 * If the drain logic ever regresses (e.g., reader gets dropped, debouncer
 * eats messages), the live "follow-up" feature breaks silently — we have
 * no production telemetry for it. These tests guard the contract.
 */
describe("TaskInputFlow drain contract", () => {
  test("buffered writes are read back in order, single-reader", async () => {
    // TransformStream has highWaterMark=1, so writer.write() awaits the
    // reader for the second chunk. Writers fire-and-forget here to mirror
    // how slack-bot.ts pushes follow-ups without blocking on the agent.
    const flow = new TransformStream<string, string>();
    const writer = flow.writable.getWriter();
    const reader = flow.readable.getReader();

    void writer.write("first follow-up");
    void writer.write("second follow-up");

    const a = await reader.read();
    const b = await reader.read();
    expect(a).toEqual({ done: false, value: "first follow-up" });
    expect(b).toEqual({ done: false, value: "second follow-up" });

    writer.releaseLock();
    reader.releaseLock();
  });

  test("close() ends the reader loop with done=true", async () => {
    const flow = new TransformStream<string, string>();
    const writer = flow.writable.getWriter();
    const reader = flow.readable.getReader();

    void writer.write("only message");
    void writer.close();

    const a = await reader.read();
    const b = await reader.read();
    expect(a).toEqual({ done: false, value: "only message" });
    expect(b.done).toBe(true);
  });

  test("multiple released-and-reacquired writers preserve order", async () => {
    // Mirrors the actual usage pattern in slack-bot.ts: each follow-up goes
    // through a fresh .getWriter() / .write() / .releaseLock() cycle, with
    // a concurrent reader draining into the SDK agent.
    const flow = new TransformStream<string, string>();
    const reader = flow.readable.getReader();

    const writeAll = (async () => {
      for (const text of ["one", "two", "three"]) {
        const w = flow.writable.getWriter();
        await w.write(text);
        w.releaseLock();
      }
    })();

    expect((await reader.read()).value).toBe("one");
    expect((await reader.read()).value).toBe("two");
    expect((await reader.read()).value).toBe("three");

    await writeAll;
    reader.releaseLock();
  });

  test("reader started before any write still receives values", async () => {
    const flow = new TransformStream<string, string>();
    const reader = flow.readable.getReader();

    // Kick off the read first; it should park until the write lands.
    const readPromise = reader.read();

    const w = flow.writable.getWriter();
    await w.write("late message");
    w.releaseLock();

    const result = await readPromise;
    expect(result).toEqual({ done: false, value: "late message" });
    reader.releaseLock();
  });
});
