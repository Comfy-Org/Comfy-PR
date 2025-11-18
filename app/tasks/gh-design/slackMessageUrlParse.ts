export function slackMessageUrlParse(url: string) {
  // slack use microsecond as message id, uniq by channel
  const match = url.match(/archives\/([^\/]+)\/p(\d+)/);
  if (!match) throw new Error(`Invalid Slack message URL: ${url}`);
  return {
    channel: match[1],
    ts: match[2].replace(/^(\d+)(\d{6})$/, "$1.$2"), // convert to full unix timestamp, in seconds with decimal 
  };
}/**
 * @deprecated use slack.chat.getPermalink instead
 */

export function slackMessageUrlStringify({ channel, ts }: { channel: string; ts: string; }) {
  // slack use microsecond as message id, uniq by channel
  // TODO: move organization to env variable
  return `https://comfy-organization.slack.com/archives/{{CHANNEL_ID}}/p{{TSNODOT}}`
    .replace("{{CHANNEL_ID}}", channel)
    .replace("{{TSNODOT}}", ts.replace(/\./g, ""));
}

