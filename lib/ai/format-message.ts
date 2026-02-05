import type { ModelMessage } from "ai";

export type FormatOptions = {
  /** Include role prefix like "[user]" or "[assistant]" */
  showRole?: boolean;
  /** Separator between parts (default: "\n") */
  partSeparator?: string;
  /** Max length for tool args preview (default: 100) */
  maxArgsLength?: number;
  /** Format for tool calls/results: "inline" | "block" */
  toolFormat?: "inline" | "block";
};

const defaultOptions: Required<FormatOptions> = {
  showRole: true,
  partSeparator: "\n",
  maxArgsLength: 100,
  toolFormat: "inline",
};

/**
 * Format a single ModelMessage to a human-readable string
 */
export function formatMessage(msg: ModelMessage, opts: FormatOptions = {}): string {
  const o = { ...defaultOptions, ...opts };
  const prefix = o.showRole ? `[${msg.role}] ` : "";

  if (typeof msg.content === "string") {
    return `${prefix}${msg.content}`;
  }

  const parts = msg.content
    .map((part) => formatPart(part, o))
    .filter(Boolean)
    .join(o.partSeparator);

  return prefix ? `${prefix}${parts}` : parts;
}

/**
 * Format an array of ModelMessages to a conversation string
 */
export function formatMessages(messages: ModelMessage[], opts: FormatOptions = {}): string {
  return messages.map((m) => formatMessage(m, opts)).join("\n\n");
}

/**
 * Format a single message part
 */
function formatPart(part: unknown, o: Required<FormatOptions>): string {
  if (!part || typeof part !== "object") return String(part);

  const p = part as Record<string, unknown>;
  const type = p.type as string;

  switch (type) {
    case "text":
      return String(p.text ?? "");

    case "tool-call": {
      const args = truncate(JSON.stringify(p.args ?? {}), o.maxArgsLength);
      if (o.toolFormat === "block") {
        return `<tool-call name="${p.toolName}" id="${p.toolCallId}">\n${args}\n</tool-call>`;
      }
      return `⚙️ ${p.toolName}(${args})`;
    }

    case "tool-result": {
      const output = formatToolOutput(p.output, o.maxArgsLength);
      if (o.toolFormat === "block") {
        return `<tool-result name="${p.toolName}" id="${p.toolCallId}">\n${output}\n</tool-result>`;
      }
      return `📤 ${p.toolName} → ${output}`;
    }

    case "reasoning":
      return `💭 ${p.text}`;

    case "image":
      return `🖼️ [image${p.mediaType ? `: ${p.mediaType}` : ""}]`;

    case "file":
      return `📎 [file: ${p.filename ?? p.mediaType ?? "unknown"}]`;

    default:
      return truncate(JSON.stringify(part), o.maxArgsLength);
  }
}

function formatToolOutput(output: unknown, maxLen: number): string {
  if (!output || typeof output !== "object") return truncate(String(output), maxLen);

  const o = output as Record<string, unknown>;
  if (o.type === "text") return truncate(String(o.value ?? ""), maxLen);
  if (o.type === "json") return truncate(JSON.stringify(o.value), maxLen);
  if (o.type === "error-text") return `❌ ${truncate(String(o.value ?? ""), maxLen)}`;
  if (o.type === "error-json") return `❌ ${truncate(JSON.stringify(o.value), maxLen)}`;
  if (o.type === "execution-denied") return `🚫 denied${o.reason ? `: ${o.reason}` : ""}`;

  return truncate(JSON.stringify(output), maxLen);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

// Quick test when run directly
if (import.meta.main) {
  const testMessages: ModelMessage[] = [
    { role: "user", content: "What's the weather?" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check the weather for you." },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "get_weather",
          args: { location: "Seattle" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "tc1",
          toolName: "get_weather",
          output: { type: "json", value: { temp: 72, condition: "sunny" } },
        },
      ],
    },
    { role: "assistant", content: "The weather in Seattle is 72°F and sunny!" },
  ];

  console.log("=== Inline Format ===");
  console.log(formatMessages(testMessages));

  console.log("\n=== Block Format ===");
  console.log(formatMessages(testMessages, { toolFormat: "block" }));
}
