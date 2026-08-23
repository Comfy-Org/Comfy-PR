const TRUNCATION_MARKER = "\n\n...TRUNCATED...\n\n";

function truncateFromMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const half = Math.floor((maxLength - TRUNCATION_MARKER.length) / 2);
  return text.slice(0, half) + TRUNCATION_MARKER + text.slice(-half);
}

export function truncateSlackText(text: string, limit = 35000): string {
  return truncateFromMiddle(text, limit);
}

type SlackBlock = Record<string, unknown> & { text?: string; type?: string };

export function truncateSlackBlocks(blocks: SlackBlock[], limit = 2900): SlackBlock[] {
  return blocks.map((block) => {
    if (block.type === "markdown" && block.text && block.text.length > limit) {
      return { ...block, text: truncateFromMiddle(block.text, limit) };
    }
    return block;
  });
}
