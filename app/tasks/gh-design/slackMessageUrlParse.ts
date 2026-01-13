export function slackMessageUrlParse(url: string) {
  // e.g. https://comfy-organization.slack.com/archives/C08FRPK0R8X/p1767701983084899?thread_ts=1766699838.506129&cid=C08FRPK0R8X
  // e.g. https://comfy-organization.slack.com/archives/C0000000000/p0000000000000000?thread_ts=0000000000.000000&cid=C0000000000
  // e.g. https://[team].slack.com/archives/[channel]/p[ts]?thread_ts=[thread_ts]&cid=[channel]

  const u = new URL(url); // validate URL
  // get channel and ts from path
  // slack use microsecond as message id, uniq by channel
  const match = url.match(/archives\/([^/]+)\/p(\d+)/);
  if (!match) throw new Error(`Invalid Slack message URL: ${url}`);
  const ts = match[2].replace(/^(\d+)(\d{6})$/, "$1.$2"); // convert Slack message ID (e.g., "1234567890123456") to Slack timestamp format with decimal (e.g., "1234567890.123456")
  return {
    channel: match[1],
    ts,
    timestamp: ts,
    team: u.hostname.split('.')[0],
    thread_ts: u.searchParams.get("thread_ts") || undefined,
  };
}

/**
 * @deprecated use slack.chat.getPermalink instead
 */
export function slackMessageUrlStringify({ channel, ts }: { channel: string; ts: string }) {
  // slack use microsecond as message id, uniq by channel
  // TODO: move organization to env variable
  return `https://comfy-organization.slack.com/archives/{{CHANNEL_ID}}/p{{TSNODOT}}`
    .replace("{{CHANNEL_ID}}", channel)
    .replace("{{TSNODOT}}", ts.replace(/\./g, ""));
}
