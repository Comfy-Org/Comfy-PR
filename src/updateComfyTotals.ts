import { groupBy, map } from "rambda";
import { match } from "ts-pattern";
import { YAML } from "zx";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";
import { CRNodes } from "./CRNodes";
import { slackNotify } from "./SlackNotifications";
import { $OK } from "./Task";

if (import.meta.main) {
  await updateComfyTotals();
}

export async function updateComfyTotals() {
  const repos = await CNRepos.find({}).toArray();
  const totals = {
    cm: CMNodes.countDocuments({}),
    cr: CRNodes.countDocuments({}),
    repos: repos.length,
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
  };
  const msg = `Totals: \n${"```" + YAML.stringify(totals) + "```"}`;
  return [await slackNotify(msg, { unique: true })];
}
