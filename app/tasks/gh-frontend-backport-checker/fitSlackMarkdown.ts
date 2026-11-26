/** Drops trailing lines so the report fits one Slack markdown block (12k cap), noting how many were cut. */
export function fitSlackMarkdown(markdown: string, limit = 11000): string {
  if (markdown.length <= limit) return markdown;
  const lines = markdown.trimEnd().split("\n");
  const kept: string[] = [];
  let length = 0;
  const note = (n: number) => `\n_…and ${n} more not shown (Slack message size limit)_\n`;
  const reserve = note(lines.length).length;
  for (const line of lines) {
    if (length + line.length + 1 + reserve > limit) break;
    kept.push(line);
    length += line.length + 1;
  }
  const dropped = lines.slice(kept.length).filter((l) => l.trim()).length;
  return kept.join("\n") + "\n" + note(dropped);
}
