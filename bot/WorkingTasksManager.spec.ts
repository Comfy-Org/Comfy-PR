import { describe, test, expect, beforeEach } from "bun:test";
import Keyv from "keyv";

describe("Working Tasks Manager", () => {
  let State: Keyv;

  beforeEach(() => {
    // Use in-memory store for testing
    State = new Keyv();
  });

  // Helper functions (same as in bot/index.ts)
  async function addWorkingTask(event: any) {
    const workingTasks = await State.get('current-working-tasks') || { workingMessageEvents: [] };
    const events = workingTasks.workingMessageEvents || [];
    
    const exists = events.some((e: any) => e.ts === event.ts && e.channel === event.channel);
    if (!exists) {
      events.push(event);
      await State.set('current-working-tasks', { workingMessageEvents: events });
    }
  }

  async function removeWorkingTask(event: any) {
    const workingTasks = await State.get('current-working-tasks') || { workingMessageEvents: [] };
    const events = workingTasks.workingMessageEvents || [];
    
    const filtered = events.filter((e: any) => !(e.ts === event.ts && e.channel === event.channel));
    await State.set('current-working-tasks', { workingMessageEvents: filtered });
  }

  test("should add task to working list", async () => {
    const event = {
      type: "app_mention" as const,
      user: "U123",
      ts: "1234567890.123456",
      text: "test message",
      team: "T123",
      blocks: [],
      channel: "C123",
      event_ts: "1234567890.123456",
    };

    await addWorkingTask(event);

    const workingTasks = await State.get('current-working-tasks');
    expect(workingTasks).toBeDefined();
    expect(workingTasks.workingMessageEvents).toHaveLength(1);
    expect(workingTasks.workingMessageEvents[0].ts).toBe(event.ts);
  });

  test("should not add duplicate tasks", async () => {
    const event = {
      type: "app_mention" as const,
      user: "U123",
      ts: "1234567890.123456",
      text: "test message",
      team: "T123",
      blocks: [],
      channel: "C123",
      event_ts: "1234567890.123456",
    };

    await addWorkingTask(event);
    await addWorkingTask(event); // Add same event again

    const workingTasks = await State.get('current-working-tasks');
    expect(workingTasks.workingMessageEvents).toHaveLength(1);
  });

  test("should remove task from working list", async () => {
    const event = {
      type: "app_mention" as const,
      user: "U123",
      ts: "1234567890.123456",
      text: "test message",
      team: "T123",
      blocks: [],
      channel: "C123",
      event_ts: "1234567890.123456",
    };

    await addWorkingTask(event);
    await removeWorkingTask(event);

    const workingTasks = await State.get('current-working-tasks');
    expect(workingTasks.workingMessageEvents).toHaveLength(0);
  });

  test("should handle multiple tasks", async () => {
    const event1 = {
      type: "app_mention" as const,
      user: "U123",
      ts: "1234567890.123456",
      text: "test message 1",
      team: "T123",
      blocks: [],
      channel: "C123",
      event_ts: "1234567890.123456",
    };

    const event2 = {
      type: "app_mention" as const,
      user: "U456",
      ts: "1234567890.654321",
      text: "test message 2",
      team: "T123",
      blocks: [],
      channel: "C456",
      event_ts: "1234567890.654321",
    };

    await addWorkingTask(event1);
    await addWorkingTask(event2);

    let workingTasks = await State.get('current-working-tasks');
    expect(workingTasks.workingMessageEvents).toHaveLength(2);

    await removeWorkingTask(event1);

    workingTasks = await State.get('current-working-tasks');
    expect(workingTasks.workingMessageEvents).toHaveLength(1);
    expect(workingTasks.workingMessageEvents[0].ts).toBe(event2.ts);
  });

  test("should handle empty state on first access", async () => {
    const workingTasks = await State.get('current-working-tasks');
    expect(workingTasks).toBeUndefined();
  });
});

