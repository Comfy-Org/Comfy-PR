import pMap from "p-map";
import { match } from "ts-pattern";
import { fetchRelatedPullWithComments } from "./fetchRelatedPullWithComments";
import type { GithubPullParsed } from "./parsePullsState";
import { readTemplateTitle } from "./readTemplateTitle";

export type RelatedPullsWithComments = Awaited<ReturnType<typeof fetchRelatedPullWithComments>>;
export type RelatedPull = Awaited<ReturnType<typeof matchRelatedPulls>>[number];
export async function matchRelatedPulls(pulls: GithubPullParsed[]): Promise<
  {
    type: "pyproject" | "publishcr" | "licence-update";
    pull: {
      title: string;
      number: number;
      url: string;
      html_url: string;
      user: { login: string; html_url: string };
      body: string | null;
      prState: "closed" | "open" | "merged";
      updatedAt: Date;
      createdAt: Date;
      updated_at: Date;
      created_at: Date;
    };
  }[]
> {
  const pyproject = await readTemplateTitle("add-toml.md");
  const publishcr = await readTemplateTitle("add-action.md");
  const licenseUpdate = await readTemplateTitle("update-toml-license.md");
  const relatedPulls = await pMap(pulls, async (pull) =>
    match(pull)
      .with({ title: pyproject }, (pull) => ({
        type: "pyproject" as const,
        pull,
      }))
      .with({ title: licenseUpdate }, (pull) => ({
        type: "licence-update" as const,
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
