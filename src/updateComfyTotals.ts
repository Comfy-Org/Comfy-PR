import { match } from "ts-pattern";
import { YAML } from "zx";
import { $flatten } from "./db/$flatten";
import { type AwaitedReturnType } from "./types/AwaitedReturnType";
import { notifySlack } from "./notifySlack";
import { $OK, TaskError, TaskOK, type Task } from "./Task";
import { $fresh, db } from "./db";
import { analyzeTotals } from "./analyzeTotals";
if (import.meta.main) {
  await updateComfyTotals();
}

type Totals = AwaitedReturnType<typeof analyzeTotals>;
export const Totals = db.collection<{
  today?: string;
  totals?: Task<Totals>;
}>("Totals");

export async function updateComfyTotals() {
  const today = new Date().toISOString().split("T")[0];
  const cached = await Totals.findOne(
    $flatten({ today, totals: { mtime: $fresh("10m"), ...$OK } }),
  );
  if (cached?.totals?.state === "ok") return [];

  const totals = await analyzeTotals().then(TaskOK).catch(TaskError);
  const updateResult = match(totals)
    .with($OK, async (totals) => {
      const msg = `Totals: \n${"```" + YAML.stringify(totals) + "```"}`;
      const notification = await notifySlack(msg, { unique: true });
      return await Totals.findOneAndUpdate(
        { today },
        { $set: { totals, notification } },
        { upsert: true },
      );
    })
    .otherwise(() => null);
  return [updateResult].flatMap((e) => (e ? [e] : []));
}

