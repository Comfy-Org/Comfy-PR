import { match } from "ts-pattern";
import YAML from "yaml";
import { $OK, TaskError, TaskOK, tsmatch } from "../packages/mongodb-pipeline-ts/Task";
import { Totals } from "./Totals";
import { analyzeTotals } from "./analyzeTotals";
import { $flatten, $fresh } from "./db";
import { notifySlack } from "@/lib/slack/notifySlack";

if (import.meta.main) {
  await updateComfyTotals();
}

export async function updateComfyTotals({ notify = true, fresh = "30m" } = {}) {
  await Totals.createIndex({ today: 1, "totals.mtime": 1, "totals.state": 1 });
  const today = new Date().toISOString().split("T")[0];
  const cached = await Totals.findOne(
    $flatten({ today, totals: { mtime: $fresh(fresh), ...$OK } }),
  );
  if (cached?.totals?.state === "ok")
    return [
      tsmatch(cached.totals)
        .with($OK, ({ data }) => data)
        .otherwise(() => null),
    ].flatMap((e) => (e ? [e] : []));
  const totals = await analyzeTotals().then(TaskOK).catch(TaskError);

  // notify if today is not already notify
  if (notify) {
    if (!(await Totals.findOne($flatten({ today, totals: { mtime: $fresh("1d"), ...$OK } }))))
      // ignore today
      await match(totals)
        .with($OK, async (totals) => {
          const msg = `Totals: \n${"```"}\n${YAML.stringify(totals)}\n${"```"}`;
          await notifySlack(msg, { unique: true });
        })
        .otherwise(() => null);
  }

  const _insertResult = await Totals.insertOne({ totals });
  return [
    tsmatch(totals)
      .with($OK, ({ data }) => data)
      .otherwise(() => null),
  ].flatMap((e) => (e ? [e] : []));
}
