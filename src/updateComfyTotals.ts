import promiseAllProperties from "promise-all-properties";
import { groupBy, map, type AnyFunction } from "rambda";
import { match } from "ts-pattern";
import { YAML } from "zx";
import { $flatten } from "./$flatten";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";
import { CRNodes } from "./CRNodes";
import { slackNotify } from "./SlackNotifications";
import { $OK, TaskError, TaskOK, type Task } from "./Task";
import { $fresh, db } from "./db";
if (import.meta.main) {
  await updateComfyTotals();
}

type AwaitedReturn<T extends AnyFunction> = Awaited<ReturnType<T>>;

type Totals = AwaitedReturn<typeof analyzeTotals>;
export const Totals = db.collection<{
  today?: string;
  totals?: Task<Totals>;
}>("Totals");
export async function updateComfyTotals() {
  const today = new Date().toISOString().split("T")[0];
  const cached = await Totals.findOne(
    $flatten({ today, totals: { mtime: $fresh("1d") } }),
  );
  if (cached) return [];

  const totals = await analyzeTotals().then(TaskOK).catch(TaskError);
  const msg = `Totals: \n${"```" + YAML.stringify(totals) + "```"}`;
  const notification = await slackNotify(msg, { unique: true });

  await Totals.findOneAndUpdate(
    { today },
    { $set: { totals, notification } },
    { upsert: true },
  );
  return [totals];
}
async function analyzeTotals() {
  const repos = await CNRepos.find({}).toArray();
  const totals = await promiseAllProperties({
    cm: CMNodes.countDocuments({}),
    cr: CRNodes.countDocuments({}),
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
    botCreatedPRs: (async function () {
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
