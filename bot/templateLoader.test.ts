import { describe, expect, test } from "bun:test";
import { replaceTemplateSlots, loadClaudeMd, loadSkills, loadSkill } from "./templateLoader";

describe("Template Loader", () => {
  test("replaceTemplateSlots - basic replacement", () => {
    const template = "Hello ${NAME}, welcome to ${PLACE}!";
    const slots = {
      NAME: "Alice",
      PLACE: "Wonderland",
    };
    const result = replaceTemplateSlots(template, slots);
    expect(result).toBe("Hello Alice, welcome to Wonderland!");
  });

  test("replaceTemplateSlots - throws on unreplaced slots", () => {
    const template = "Hello ${NAME}, welcome to ${PLACE}!";
    const slots = {
      NAME: "Alice",
      // Missing PLACE
    };
    expect(() => replaceTemplateSlots(template, slots)).toThrow(/unreplaced slots/i);
  });

  test("replaceTemplateSlots - handles multiple occurrences", () => {
    const template = "${VAR} ${VAR} ${VAR}";
    const slots = { VAR: "test" };
    const result = replaceTemplateSlots(template, slots);
    expect(result).toBe("test test test");
  });

  test("loadClaudeMd - loads and replaces slots", () => {
    const slots = {
      EVENT_CHANNEL: "C123",
      QUICK_RESPOND_MSG_TS: "1234567890.123456",
      USERNAME: "testuser",
      NEARBY_MESSAGES_YAML: "[]",
      EVENT_TEXT_JSON: '"test message"',
      USER_INTENT: "test intent",
      MY_RESPONSE_MESSAGE_JSON: '"test response"',
      EVENT_THREAD_TS: "1234567890.123456",
    };
    const result = loadClaudeMd(slots);
    expect(result).toContain("ComfyPR-Bot");
    expect(result).toContain("C123");
    expect(result).toContain("testuser");
    expect(result).toContain("test intent");
    expect(result).not.toContain("${");
  });

  test("loadSkills - loads all skills", () => {
    const slots = {
      EVENT_CHANNEL: "C123",
      QUICK_RESPOND_MSG_TS: "1234567890.123456",
      EVENT_THREAD_TS: "1234567890.123456",
    };
    const skills = loadSkills(slots);
    expect(Object.keys(skills).length).toBeGreaterThan(0);
    expect(skills["slack-messaging"]).toBeDefined();
    expect(skills["slack-file-sharing"]).toBeDefined();
    expect(skills["github-prbot"]).toBeDefined();
    expect(skills["slack-messaging"]).toContain("C123");
    expect(skills["slack-messaging"]).not.toContain("${");
  });

  test("loadSkill - loads specific skill", () => {
    const slots = {
      EVENT_CHANNEL: "C123",
      QUICK_RESPOND_MSG_TS: "1234567890.123456",
      EVENT_THREAD_TS: "1234567890.123456",
    };
    const skill = loadSkill("slack-messaging", slots);
    expect(skill).toContain("Slack Thread Messaging");
    expect(skill).toContain("C123");
    expect(skill).not.toContain("${");
  });

  test("loadSkill - throws on missing skill", () => {
    const slots = {
      EVENT_CHANNEL: "C123",
      QUICK_RESPOND_MSG_TS: "1234567890.123456",
      EVENT_THREAD_TS: "1234567890.123456",
    };
    expect(() => loadSkill("nonexistent-skill", slots)).toThrow();
  });
});
