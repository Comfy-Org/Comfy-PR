import { getSlackCached } from "@/src/slack/slackCached";
import { isSlackAvailable } from "@/src/slack";

/**
 * Parse Slack message format to Markdown
 * Converts Slack's formatting to standard Markdown:
 * - <@U123> -> @username (Real Name)
 * - <#C123|channel> -> #channel
 * - <https://example.com|link text> -> [link text](https://example.com)
 * - *bold* -> **bold**
 * - _italic_ -> *italic*
 * - `code` -> `code`
 * - ```code block``` -> ```code block```
 */
export async function parseSlackMessageToMarkdown(text: string): Promise<string> {
  let markdown = text;

  // Convert user mentions <@U123> to @username (Real Name)
  // Extract all user IDs first
  const userIdMatches = [...markdown.matchAll(/<@([A-Z0-9]+)>/g)];
  const userIds = [...new Set(userIdMatches.map(match => match[1]))];

  // Fetch user info for all mentioned users (if Slack is available)
  const userInfoMap = new Map<string, string>();
  if (isSlackAvailable() && userIds.length > 0) {
    const slack = getSlackCached();
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const userInfo = await slack.users.info({ user: userId });
          if (userInfo.ok && userInfo.user) {
            const username = userInfo.user.name || userId;
            const realName = userInfo.user.real_name || userInfo.user.profile?.real_name;
            const displayText = realName ? `@${username} (${realName})` : `@${username}`;
            userInfoMap.set(userId, displayText);
          } else {
            userInfoMap.set(userId, `@${userId}`);
          }
        } catch (error) {
          // Fallback to user ID if fetch fails
          userInfoMap.set(userId, `@${userId}`);
        }
      })
    );
  }

  // Replace user mentions with fetched info
  markdown = markdown.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
    return userInfoMap.get(userId) || `@${userId}`;
  });

  // Convert channel mentions <#C123|channel-name> or <#C123>
  markdown = markdown.replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2");
  markdown = markdown.replace(/<#([A-Z0-9]+)>/g, "#$1");

  // Convert links <https://example.com|link text> to [link text](https://example.com)
  markdown = markdown.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "[$2]($1)");

  // Convert plain links <https://example.com>
  markdown = markdown.replace(/<(https?:\/\/[^>]+)>/g, "$1");

  // Convert Slack bold *text* to Markdown **text**
  // But preserve code blocks and inline code first
  const codeBlocks: string[] = [];
  markdown = markdown.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `\x00CODEBLOCK\x00${codeBlocks.length - 1}\x00`;
  });

  const inlineCode: string[] = [];
  markdown = markdown.replace(/`[^`]+`/g, (match) => {
    inlineCode.push(match);
    return `\x00INLINECODE\x00${inlineCode.length - 1}\x00`;
  });

  // Now convert bold and italic
  markdown = markdown.replace(/\*([^*]+)\*/g, "**$1**");
  markdown = markdown.replace(/_([^_]+)_/g, "*$1*");

  // Restore code blocks and inline code
  markdown = markdown.replace(/\x00INLINECODE\x00(\d+)\x00/g, (_, idx) => inlineCode[parseInt(idx)]);
  markdown = markdown.replace(/\x00CODEBLOCK\x00(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);

  return markdown;
}

if (import.meta.main) {
  // Test examples
  const tests = [
    "Hello <@U123> in <#C456|general>",
    "Check out <https://example.com|this link>",
    "This is *bold* and _italic_ and `code`",
    "```\ncode block\n```",
    "Mixed <@U123> with *bold* and <https://example.com>",
    // Real user ID test (if Slack token is available)
    "<@U078499LK5K> explain why this issue happened cc. <@U04F3GHTG2X>",
  ];

  console.log(`Slack available: ${isSlackAvailable()}`);
  console.log("");

  for (const test of tests) {
    console.log("Input: ", test);
    console.log("Output:", await parseSlackMessageToMarkdown(test));
    console.log("---");
  }
}
