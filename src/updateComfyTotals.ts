import { match } from "ts-pattern";
import YAML from "yaml";
import { Totals } from "./Totals";
import { analyzeTotals } from "./analyzeTotals";
import { $filaten, $fresh } from "./db";
import { notifySlack } from "./slack/notifySlack";
import { $OK, TaskError, TaskOK } from "./utils/Task";
import { tsmatch } from "./utils/tsmatch";

if (import.meta.main) {
  await updateComfyTotals();
}

export async function updateComfyTotals({ notify = true, fresh ='30m'} = {}) {
  const today = new Date().toISOString().split("T")[0];
  const cached = await Totals.findOne($filaten({ today, totals: { mtime: $fresh(fresh), ...$OK } }));
  if (cached?.totals?.state === "ok")
    return [
      tsmatch(cached.totals)
        .with($OK, ({ data }) => data)
        .otherwise(() => null),
    ].flatMap((e) => (e ? [e] : []));
  const totals = await analyzeTotals().then(TaskOK).catch(TaskError);

  // notify
  notify &&
    (await match(totals)
      .with($OK, async (totals) => {
        const msg = `Totals: \n${"```"}\n${YAML.stringify(totals)}\n${"```"}`;
        await notifySlack(msg, { unique: true });
      })
      .otherwise(() => null));

  const insertResult = await Totals.insertOne({ totals });
  return [
    tsmatch(totals)
      .with($OK, ({ data }) => data)
      .otherwise(() => null),
  ].flatMap((e) => (e ? [e] : []));
}
