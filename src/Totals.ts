import { match } from "ts-pattern";
import YAML from "yaml";
import { analyzeTotals } from "./analyzeTotals";
import { $flatten, $fresh, db } from "./db";
import { notifySlack } from "./notifySlack";
import { type AwaitedReturnType } from "./types/AwaitedReturnType";
import { $OK, TaskError, TaskOK, type Task } from "./utils/Task";

type Totals = AwaitedReturnType<typeof analyzeTotals>;
export const Totals = db.collection<{
  today?: string;
  totals?: Task<Totals>;
}>("Totals");

if (import.meta.main) {
  await updateComfyTotals();
}

export async function updateComfyTotals() {
  const today = new Date().toISOString().split("T")[0];
  const cached = await Totals.findOne($flatten({ today, totals: { mtime: $fresh("10m"), ...$OK } }));
  if (cached?.totals?.state === "ok") return [];

  const totals = await analyzeTotals().then(TaskOK).catch(TaskError);

  // notify
  await match(totals)
    .with($OK, async (totals) => {
      const msg = `Totals: \n${"```" + YAML.stringify(totals) + "```"}`;
      await notifySlack(msg, { unique: true });
    })
    .otherwise(() => null);

  const insertResult = await Totals.insertOne({ totals });
  return [insertResult].flatMap((e) => (e ? [e] : []));
}
