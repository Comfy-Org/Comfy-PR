import DIE from "@snomiao/die";
import pMap from "p-map";
import { match } from "ts-pattern";
import { CNRepos } from "./CNRepos";
import { type GithubPull } from "./fetchRepoPRs";
import { readTemplateTitle } from "./readTemplateTitle";
import { $OK } from "./Task";
import { fetchRelatedPullWithComments } from "./fetchRelatedPullWithComments";

export type RelatedPullsWithComments = Awaited<ReturnType<typeof fetchRelatedPullWithComments>>;
export type RelatedPull = Awaited<ReturnType<typeof matchRelatedPulls>>[number];
export async function matchRelatedPulls(pulls: GithubPull[]) {
  const pyproject = await readTemplateTitle("add-toml.md");
  const publishcr = await readTemplateTitle("add-action.md");
  const relatedPulls = await pMap(pulls, async (pull) =>
    match(pull)
      .with({ title: pyproject }, (pull) => ({
        type: "pyproject" as const,
        pull,
      }))
      .with({ title: publishcr }, (pull) => ({
        type: "publishcr" as const,
        pull,
      }))
      .otherwise(() => null),
  );
  return relatedPulls.flatMap((e) => (e ? [e] : []));
}
