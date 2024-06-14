import promiseAllProperties from "promise-all-properties";
import { groupBy, map } from "rambda";
import { match } from "ts-pattern";
import { CMNodes } from "./CMNodes";
import { CNRepos } from "./CNRepos";
import { CRNodes } from "./CRNodes";
import { $OK } from "./Task";

export async function analyzeTotals() {
  const repos = await CNRepos.find({}).toArray();
  const totals = await promiseAllProperties({
    ComfyManagerNodes: CMNodes.countDocuments({}),
    ComfyRegistryNodes: CRNodes.countDocuments({}),
    repos: CNRepos.countDocuments(),
    allRegistryPRs: (async function () {
      const pulls = repos
        .flatMap((repo) => match(repo.crPulls)
          .with($OK, ({ data }) => data)
          .otherwise(() => null)
        )
        .flatMap((e) => (e ? [e] : []));
      const groups = groupBy((e) => e.type, pulls);
      const total = map((e: any[]) => e.length, groups);
      return total;
    })(),
    ghActionBotCreatedPRs: (async function () {
      const pulls = repos
        .flatMap((repo) => match(repo.createdPulls)
          .with($OK, ({ data }) => data)
          .otherwise(() => null)
        )
        .flatMap((e) => (e ? [e] : []));
      const groups = groupBy((e) => e.title, pulls);
      const total = map((e: any[]) => e.length, groups);
      return total;
    })(),
  });
  return totals;
}
