import { describe, expect, it } from "bun:test";
import { parseSlackMessageToMarkdown } from "./parseSlackMessageToMarkdown";

describe("parseSlackMessageToMarkdown", () => {
  it("should convert user mentions (fallback to ID when Slack unavailable)", async () => {
    const input = "Hello <@U123ABC>";
    const output = await parseSlackMessageToMarkdown(input);
    // When Slack is unavailable or user fetch fails, it falls back to @userId
    expect(output).toBe("Hello @U123ABC");
  });

  it("should convert channel mentions with pipe", async () => {
    const input = "Check <#C123ABC|general>";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Check #general");
  });

  it("should convert channel mentions without pipe", async () => {
    const input = "Check <#C123ABC>";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Check #C123ABC");
  });

  it("should convert links with text", async () => {
    const input = "Visit <https://example.com|our website>";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Visit [our website](https://example.com)");
  });

  it("should convert plain links", async () => {
    const input = "Visit <https://example.com>";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Visit https://example.com");
  });

  it("should convert bold text", async () => {
    const input = "This is *bold* text";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("This is **bold** text");
  });

  it("should convert italic text", async () => {
    const input = "This is _italic_ text";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("This is *italic* text");
  });

  it("should preserve inline code", async () => {
    const input = "Run `npm install` first";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Run `npm install` first");
  });

  it("should preserve code blocks", async () => {
    const input = "Example:\n```\nconst x = 1;\n```";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Example:\n```\nconst x = 1;\n```");
  });

  it("should handle mixed formatting", async () => {
    const input = "Hello <@U123> in <#C456|general> with *bold* and _italic_ and `code`";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Hello @U123 in #general with **bold** and *italic* and `code`");
  });

  it("should not apply formatting inside inline code", async () => {
    const input = "Use `*asterisks*` and `_underscores_` in code";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("Use `*asterisks*` and `_underscores_` in code");
  });

  it("should not apply formatting inside code blocks", async () => {
    const input = "```\n*bold* and _italic_ here\n```";
    const output = await parseSlackMessageToMarkdown(input);
    expect(output).toBe("```\n*bold* and _italic_ here\n```");
  });
});
