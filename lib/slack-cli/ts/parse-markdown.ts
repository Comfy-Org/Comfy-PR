export interface SlackMarkdownResolver {
  resolveUser?: (id: string) => Promise<string>;
  resolveChannel?: (id: string) => Promise<string>;
}

export function parseSlackMrkdwnSync(text: string): string {
  let md = text;

  md = md.replace(/<@([A-Z0-9]+)>/g, "@$1");
  md = md.replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2");
  md = md.replace(/<#([A-Z0-9]+)>/g, "#$1");
  md = md.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "[$2]($1)");
  md = md.replace(/<(https?:\/\/[^>]+)>/g, "$1");

  const codeBlocks: string[] = [];
  md = md.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  const inlineCode: string[] = [];
  md = md.replace(/`[^`]+`/g, (m) => {
    inlineCode.push(m);
    return `\x00IC${inlineCode.length - 1}\x00`;
  });

  md = md.replace(/\*([^*]+)\*/g, "**$1**");
  md = md.replace(/_([^_]+)_/g, "*$1*");

  md = md.replace(/\x00IC(\d+)\x00/g, (_, i) => inlineCode[parseInt(i)]);
  md = md.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);

  return md;
}

export async function parseSlackMessageToMarkdown(
  text: string,
  resolver?: SlackMarkdownResolver,
): Promise<string> {
  let md = text;

  if (resolver?.resolveUser) {
    const matches = [...md.matchAll(/<@([A-Z0-9]+)>/g)];
    const ids = [...new Set(matches.map((m) => m[1]))];
    const names = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          names.set(id, await resolver.resolveUser!(id));
        } catch {
          names.set(id, `@${id}`);
        }
      }),
    );
    md = md.replace(/<@([A-Z0-9]+)>/g, (_, id) => names.get(id) || `@${id}`);
  } else {
    md = md.replace(/<@([A-Z0-9]+)>/g, "@$1");
  }

  md = md.replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2");

  if (resolver?.resolveChannel) {
    const matches = [...md.matchAll(/<#([A-Z0-9]+)>/g)];
    const ids = [...new Set(matches.map((m) => m[1]))];
    const names = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          names.set(id, await resolver.resolveChannel!(id));
        } catch {
          names.set(id, `#${id}`);
        }
      }),
    );
    md = md.replace(/<#([A-Z0-9]+)>/g, (_, id) => names.get(id) || `#${id}`);
  } else {
    md = md.replace(/<#([A-Z0-9]+)>/g, "#$1");
  }

  md = md.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "[$2]($1)");
  md = md.replace(/<(https?:\/\/[^>]+)>/g, "$1");

  const codeBlocks: string[] = [];
  md = md.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  const inlineCode: string[] = [];
  md = md.replace(/`[^`]+`/g, (m) => {
    inlineCode.push(m);
    return `\x00IC${inlineCode.length - 1}\x00`;
  });

  md = md.replace(/\*([^*]+)\*/g, "**$1**");
  md = md.replace(/_([^_]+)_/g, "*$1*");

  md = md.replace(/\x00IC(\d+)\x00/g, (_, i) => inlineCode[parseInt(i)]);
  md = md.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);

  return md;
}
