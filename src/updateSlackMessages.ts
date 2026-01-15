import { $fresh, $stale } from "@/packages/mongodb-pipeline-ts";
import { $flatten } from "@/packages/mongodb-pipeline-ts/$flatten";
import pMap from "p-map";
import { postSlackMessage } from "./postSlackMessage";
import { SlackMsgs } from "@/lib/slack/SlackMsgs";

/**
 * @deprecated use upsertSlackMessage instead
 */
export async function updateSlackMessages() {
  // send
  return await pMap(
    SlackMsgs.find(
      $flatten({
        $or: [
          { status: { $exists: false } },
          {
            status: { $in: ["pending last", "error"] },
            mtime: $stale("5m"), // try errors again after 5m
          },
        ],
      }),
    ),
    async ({ _id, text, last_id: last, silent }) => {
      await SlackMsgs.updateOne({ _id }, { $set: { status: "sending" } });
      // max 5 msg per 30s
      while (5 <= (await SlackMsgs.countDocuments({ mtime: $fresh("30s") })))
        await new Promise((r) => setTimeout(r, 1000));
      if (last) {
        // check if last succ
        const lastSent = await SlackMsgs.findOne({ _id: last });
        if (lastSent?.status !== "sent") {
          await SlackMsgs.updateOne({ _id }, { $set: { status: "pending last" } });
          return;
        }
      }
      console.log("SLACK POST MSG: " + JSON.stringify(text));
      if (silent)
        return await SlackMsgs.updateOne({ _id }, { $set: { status: "sent", mtime: new Date() } });
      const sent = await postSlackMessage(text)
        .then((e) => ({ ...e, error: undefined, status: "sent" as const }))
        .catch((e) => ({ error: e.message ?? String(e), status: "error" as const }));
      await SlackMsgs.updateOne({ _id }, { $set: { ...sent, mtime: new Date() } });
    },
    { concurrency: 2 },
  );
}
