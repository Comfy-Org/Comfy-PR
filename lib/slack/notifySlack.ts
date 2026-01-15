import { updateSlackMessages } from "@/src/updateSlackMessages";
import { SlackMsgs, type SlackNotifyOptions } from "./SlackMsgs";

if (import.meta.main) {
  const text = "# Hello world\n\ntest rich message at " + new Date().toISOString();
  console.log(await notifySlack(text));
}

export async function notifySlack(
  text: string,
  { unique = true, last, silent }: SlackNotifyOptions = {},
) {
  const limit = 3000; // slack message limit is 3001
  if (text.length > limit) {
    const lines = text.split("\n");
    const lineLimit = lines.findIndex((_, i) => {
      const text = lines.slice(0, i + 1).join("\n");
      return text.length > limit;
    });

    const head = lines.slice(0, lineLimit).join("\n");
    const remains = lines.slice(lineLimit).join("\n");
    const sent = await notifySlack(head, { unique, silent });
    return await notifySlack("...\n" + remains, { unique, last: sent._id });
  }
  if (unique) {
    const existed = await SlackMsgs.findOne({ text });
    if (existed) return existed;
  }
  // add task
  const { insertedId: _id } = await SlackMsgs.insertOne({
    text,
    ...(unique && { unique }),
    ...(silent && { silent }),
    ...(last && { last_id: last }),
  });
  console.info(text);

  updateSlackMessages().then(() => console.info("slack notify task done"));
  return { _id };
}
