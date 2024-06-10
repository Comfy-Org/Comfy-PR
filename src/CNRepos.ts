/* 
 bun src/CNRepos.ts
  */
import pMap from "p-map";
import promiseAllProperties from "promise-all-properties";
import { CMNodes, updateCMNodes, type CMNode } from "./CMNodes";
import { CRNodes, updateCRNodes, type CRNode } from "./CRNodes";
import { db } from "./db";
import {
  updateCNRepoLinkings,
  updateCNRepoPRStatus,
  type PRLink,
} from "./updateRepoPRStatus";
import { slackNotify, type SlackNotification } from "./SlackNotifications";
import { slackLinksNotify } from "./slackUrlsNotify";
import {
  updateRepoPRs,
  type GithubRepoPR,
  type GithubRepoPRs,
} from "./fetchRepoPRs";
import DIE from "@snomiao/die";
import { shuffleArray } from "rxdb";
import { ComfyRegistryPRs } from "./ComfyRegistryPRs";
import { CNPulls } from "./CNPulls-bak";
import { $ } from "./echoBunShell";
import { gh } from "./gh";
import { repoUrlParse } from "./parseOwnerRepo";

type Sent = {
  slack?: SlackNotification;
  emails?: { from: string; to: string; title: string; body: string }[];
};

export type CustomNodeRepo = {
  repository: string;
  prs?: {
    toml?: Pick<GithubRepoPR, "html_url" | "state">;
    action?: Pick<GithubRepoPR, "html_url" | "state">;
    mtime?: Date;
    error?: string;
  };
  candiate?: boolean;
  archived?: boolean;
  prsTask?: {
    stime?: Date;
    mtime?: Date;
    error?: string;
    status?: "idle" | "pending" | "done" | "error";
  };
  cr?: CRNode;
  cm?: CMNode;
  events?: { prsFound?: Sent };
};
export const CNRepos = db.collection<CustomNodeRepo>("CNRepos");
await CNRepos.createIndex({ repository: 1 }, { unique: true });

if (import.meta.main) {
  // await cacheHealthReport();
  await updateCNRepos();
  // updateCNReposPRTasks
  await scanCNRepoThenPRs();
  // await pMap(candidates, (e) => updateCNRepoPRStatus(e.repository), { concurrency: 4 });
  // candidates
}

export async function scanCNRepoThenPRs() {
  const _candidates = await scanCNRepoCandidates();
  const candidates = await pMap(
    _candidates,
    async ({ repository }) => {
      const ghrepo = await gh.repos.get({ ...repoUrlParse(repository) });
      return (await CNRepos.findOneAndUpdate(
        { repository },
        { $set: { archived: ghrepo.data.archived } },
        { upsert: true }
      ))!;
    },
    { concurrency: 3 }
  );

  await pMap(
    shuffleArray(candidates),
    async ({ repository, archived }) => {
      if (archived) return;
      await CNRepos.updateOne(
        { repository },
        { $set: { prsTask: { status: "pending", stime: new Date() } } }
      );
      await ComfyRegistryPRs(repository).catch(async (e) => {
        await CNRepos.updateOne(
          { repository },
          {
            $set: {
              prsTask: { status: "error", mtime: new Date(), error: e.message },
            },
          }
        );
        throw e;
      });
      const prUpdateResult = await updateCNRepoPRStatus(repository);
      const links = [prUpdateResult]
        .filter((e) => e.modifiedCount || e.upsertedCount)
        .flatMap((e) => e.links);
      await slackLinksNotify("Custom Node Repo prs created", links);
      await CNRepos.updateOne(
        { repository },
        { $set: { prsTask: { status: "done", mtime: new Date() } } }
      );
    },
    { concurrency: 1, stopOnError: false }
  );
}

async function scanCNRepoCandidates() {
  const candidates = (
    await CNRepos.find({
      "prs.mtime": { $gt: new Date(+new Date() - 86400e3) },
      $or: [{ "prs.toml": null }, { "prs.action": null }],
      "prs.error": null,
      // candiate: {$ne: true},
    }).toArray()
  ).filter((e) => !e.candiate);

  console.log({ candidates });
  await slackLinksNotify(
    "New Registry PR Candidates",
    candidates.map((e) => ({
      href: e.repository,
      name:
        e.repository +
        " ADD " +
        [!e.prs?.toml && "TOML", !e.prs?.action && "GHACTION"]
          .filter(Boolean)
          .join(","),
    }))
  );
  await pMap(candidates, (e) =>
    CNRepos.updateOne(
      { repository: e.repository },
      { $set: { candiate: true } }
    )
  );
  return candidates;
}

async function cacheHealthReport() {
  // const aggr = await CNRepos.aggregate([
  //   { $match: { "prs.mtime": { $gte: new Date(+Date.now() - 86400e3) } } },
  //   { $project: { toml: { count: "prs.toml" } } },
  // ]).toArray();
  // console.log({ aggr });
  const allPrs = (await CNRepos.find().toArray()).map((e) => e.prs);
  console.log(allPrs);
}

export default async function updateCNRepos() {
  await Promise.all([updateCRNodes(), updateCMNodes()]);
  const { crNodes, cmNodes } = await promiseAllProperties({
    crNodes: CRNodes.find().toArray(),
    cmNodes: CMNodes.find().toArray(),
  });
  const repos = [
    ...crNodes
      .map(
        (e) => e.repository // || DIE("WARN: empty repo in " + JSON.stringify(e))
      )
      .filter(Boolean),
    ...cmNodes
      .map((e) => e.reference || DIE("WARN: empty repo" + JSON.stringify(e)))
      .filter((e) => e.startsWith("https://github.com")) // remove civitai
      .filter(Boolean),
  ].toSorted();

  // console.log("linkings updating");
  // await pMap(repos, updateCNRepoLinkings);

  console.log("prs updating");
  const batchSize = 8;
  const randRepos = shuffleArray(repos);
  for (let i = 0; i < randRepos.length; i += batchSize) {
    const batch = randRepos.slice(i, i + batchSize);
    const result = await pMap(batch, updateCNRepoPRStatus, {
      concurrency: 4,
      stopOnError: false,
    });
    const links = result
      .filter((e) => e.modifiedCount || e.upsertedCount)
      .flatMap((e) => e.links);
    await slackLinksNotify("Custom Node Repo prs updated", links);
  }

  console.log("All repo updated");
}
