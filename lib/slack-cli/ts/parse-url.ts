export function parseSlackUrl(url: string): { channel: string; ts: string } | null {
  try {
    const urlObj = new URL(url);

    const archivesMatch = urlObj.pathname.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/);
    if (archivesMatch) {
      const channel = archivesMatch[1];
      const raw = archivesMatch[2];
      const ts = `${raw.slice(0, 10)}.${raw.slice(10)}`;
      const threadTs = urlObj.searchParams.get("thread_ts");
      return { channel, ts: threadTs || ts };
    }

    const clientMatch = urlObj.pathname.match(/\/client\/[A-Z0-9]+\/([A-Z0-9]+)\/(\d+)/);
    if (clientMatch) {
      const channel = clientMatch[1];
      const raw = clientMatch[2];
      const ts = `${raw.slice(0, 10)}.${raw.slice(10)}`;
      return { channel, ts };
    }

    return null;
  } catch {
    return null;
  }
}

export function slackMessageUrlParse(
  url: string,
): { team: string; channel: string; ts: string } | null {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname;

    const archivesMatch = urlObj.pathname.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/);
    if (archivesMatch) {
      const team = host.replace(".slack.com", "");
      const channel = archivesMatch[1];
      const raw = archivesMatch[2];
      const ts = `${raw.slice(0, 10)}.${raw.slice(10)}`;
      const threadTs = urlObj.searchParams.get("thread_ts");
      return { team, channel, ts: threadTs || ts };
    }

    const clientMatch = urlObj.pathname.match(/\/client\/([A-Z0-9]+)\/([A-Z0-9]+)\/(\d+)/);
    if (clientMatch) {
      const team = clientMatch[1];
      const channel = clientMatch[2];
      const raw = clientMatch[3];
      const ts = `${raw.slice(0, 10)}.${raw.slice(10)}`;
      return { team, channel, ts };
    }

    return null;
  } catch {
    return null;
  }
}
