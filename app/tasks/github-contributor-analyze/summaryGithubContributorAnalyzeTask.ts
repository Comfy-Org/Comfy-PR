import { yaml } from "@/src/utils/yaml";
import { compareBy } from "comparing";
import * as d3 from "d3";
import isCI from "is-ci";
import { groupBy, sum, uniq, uniqBy } from "rambda";
import sflow from "sflow";
import {
  GithubContributorAnalyzeTask,
  GithubContributorAnalyzeTaskFilter,
} from "./GithubContributorAnalyzeTask";

if (import.meta.main) {
  // analyze
  await summaryGithubContributorAnalyzeTask();

  if (isCI) process.exit(0);
}

export async function summaryGithubContributorAnalyzeTask() {
  // clean solved error
  //   await GithubContributorAnalyzeTask.updateMany(
  //     { contributors: { $exists: true } },
  //     { $unset: { error: 1, errorAt: 1 } },
  //   );
  const remains = await GithubContributorAnalyzeTask.countDocuments(
    GithubContributorAnalyzeTaskFilter,
  );
  const data = await sflow(GithubContributorAnalyzeTask.find({})).toArray();
  const flat = data
    .map((e) => e.contributors?.map((y) => ({ ...y, repoUrl: e.repoUrl })) ?? [])
    .flat();
  const byEmails = groupBy((e) => e.email?.toLowerCase() ?? "", flat);
  const json = Object.entries(byEmails)
    .map(([email, e]) => ({
      email,
      commitCount: sum(e!.map((e) => e!.count)),
      //   repos: e!
      //     .map((e) => stringifyGithubRepoUrl(parseGithubRepoUrl(e!.repoUrl)).slice("https://github.com".length))
      //     .join(" "),
      repoCount: uniq(e!.map((e) => e!.repoUrl)).length,
      usernameCount: uniq(e!.map((e) => e!.name)).length,
      usernames: uniqBy(
        (e) => e.toLocaleLowerCase(),
        e!.map((e) => e!.name),
      )
        .toSorted()
        .join(" / "),
    }))
    .toSorted(compareBy((e) => -e.commitCount));
  const total = {
    emails: json.length,
    // for snomiao+comfy@gmail.com, remove +comfy and keep snomiao@gmail.com
    dedupedEmails: uniq(json.map((e) => e.email.replace(/\+.*@/, "@"))).length,
    commitCount: sum(json.map((e) => e.commitCount)),
    allRepoCount: uniq(data.map((e) => e.repoUrl)).length,
    usernameCount: sum(json.map((e) => e.usernameCount)),

    cloneableRepoCount: data.length - remains,
  };
  console.log(total);
  const date = new Date().toISOString().slice(0, 10);
  await globalThis.Bun?.write(`./report/uniq-contributor-emails.csv`, d3.csvFormat(json));
  await globalThis.Bun?.write(`./report/uniq-contributor-emails-total.yaml`, yaml.stringify(total));
  await globalThis.Bun?.write(`./report/${date}-uniq-contributor-emails.csv`, d3.csvFormat(json));
  await globalThis.Bun?.write(
    `./report/${date}-uniq-contributor-emails-total.yaml`,
    yaml.stringify(total),
  );
  console.log("done");
  return { json, total };
}
