import { sortBy } from "rambda";
import { notifySlack } from "./notifySlack";

export async function notifySlackLinks(
  topic: string,
  urls: (string | { href: string; name: string })[],
) {
  if (!urls.length) return;
  const urlList = sortBy((e) => JSON.stringify(e), urls)
    .map((e) => "- " + (typeof e === "string" ? e : "<" + e.href + "|" + e.name + ">"))
    .join("\n");
  const msg = `[INFO] ${topic}:\n${urlList}\n.`;
  return await notifySlack(msg, { unique: true });
}
