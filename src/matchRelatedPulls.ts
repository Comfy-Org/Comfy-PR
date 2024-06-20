import pMap from "p-map";
import { match } from "ts-pattern";
import { fetchRelatedPullWithComments } from "./fetchRelatedPullWithComments";
import type { GithubPullParsed } from "./parsePullsState";
import { readTemplateTitle } from "./readTemplateTitle";

export type RelatedPullsWithComments = Awaited<ReturnType<typeof fetchRelatedPullWithComments>>;
export type RelatedPull = Awaited<ReturnType<typeof matchRelatedPulls>>[number];
export async function matchRelatedPulls(pulls: GithubPullParsed[]) {
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
