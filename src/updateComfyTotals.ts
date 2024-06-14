import promiseAllProperties from "promise-all-properties";
import { groupBy, map } from "rambda";
import { match } from "ts-pattern";
import { YAML } from "zx";
import { $flatten } from "./$flatten";
import { type AwaitedReturnType } from "./AwaitedReturnType";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";
import { CRNodes } from "./CRNodes";
import { slackNotify } from "./SlackNotifications";
import { $OK, TaskError, TaskOK, type Task } from "./Task";
import { $fresh, db } from "./db";
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
    $flatten({ today, totals: { mtime: $fresh("1d"), ...$OK } }),
  );
  if (cached?.totals?.state === "ok") return [];

  const totals = await analyzeTotals().then(TaskOK).catch(TaskError);
  const updateResult = match(totals)
    .with($OK, async (totals) => {
      const msg = `Totals: \n${"```" + YAML.stringify(totals) + "```"}`;
      const notification = await slackNotify(msg, { unique: true });
      return await Totals.findOneAndUpdate(
        { today },
        { $set: { totals, notification } },
        { upsert: true },
      );
    })
    .otherwise(() => null);
  return [updateResult].flatMap((e) => (e ? [e] : []));
}
async function analyzeTotals() {
  const repos = await CNRepos.find({}).toArray();
  const totals = await promiseAllProperties({
    ComfyManagerNodes: CMNodes.countDocuments({}),
    ComfyRegistryNodes: CRNodes.countDocuments({}),
    repos: CNRepos.countDocuments(),
    allRegistryPRs: (async function () {
      const pulls = repos
        .flatMap((repo) =>
          match(repo.crPulls)
            .with($OK, ({ data }) => data)
            .otherwise(() => null),
        )
        .flatMap((e) => (e ? [e] : []));
      const groups = groupBy((e) => e.type, pulls);
      const total = map((e: any[]) => e.length, groups);
      return total;
    })(),
    ghActionBotCreatedPRs: (async function () {
      const pulls = repos
        .flatMap((repo) =>
          match(repo.createdPulls)
            .with($OK, ({ data }) => data)
            .otherwise(() => null),
        )
        .flatMap((e) => (e ? [e] : []));
      const groups = groupBy((e) => e.title, pulls);
      const total = map((e: any[]) => e.length, groups);
      return total;
    })(),
  });
  return totals;
}
