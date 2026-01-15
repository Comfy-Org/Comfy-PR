import { db } from "@/src/db";
import { gh } from "@/lib/github";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { getSlackChannel } from "@/lib/slack/channels";
import DIE from "@snomiao/die";
import isCI from "is-ci";
import parseGithubUrl from "parse-github-url";
import sflow from "sflow";
import { upsertSlackMessage } from "./upsertSlackMessage";
// workflow
/**
 * 1. fetch repos latest releases
 * 2. save the release info to the database
 * 3. if it's stable, notify the release to slack
 * 4. if it's a pre-release, do nothing
 */
const config = {
  repos: ["https://github.com/comfyanonymous/ComfyUI", "https://github.com/Comfy-Org/desktop"],
  slackChannel: "desktop",
  slackMessage: "🔮 {repo} <{url}|Release {version}> is {status}!",
  sendSince: new Date("2025-08-02T00:00:00Z").toISOString(), // only send notifications for releases after this date (UTC)
};

const coreVersionPattern = /Update ComfyUI core to (v\S+)/;
export type GithubReleaseNotificationTask = {
  url: string; // github release url
  version?: string; // released version, e.g. v1.0.0, v2.0.0-beta.1
  coreVersion?: string; // for desktop repo, match /Update ComfyUI core to (v\S+)/
  createdAt: Date;
  releasedAt?: Date;
  isStable?: boolean; // true if the release is stable, false if it's a pre-release
  status: "draft" | "prerelease" | "stable";

  // when it's drafting/pre-release
  slackMessageDrafting?: {
    text: string;
    channel: string;
    url?: string; // set after sent
  };

  // send when it's stable, will reply the drafting url if there are one
  slackMessage?: {
    text: string;
    channel: string;
    url?: string; // set after sent
  };
};

export const GithubReleaseNotificationTask = db.collection<GithubReleaseNotificationTask>(
  "GithubReleaseNotificationTask",
);
await GithubReleaseNotificationTask.createIndex({ url: 1 }, { unique: true });
const save = async (task: { url: string } & Partial<GithubReleaseNotificationTask>) =>
  (await GithubReleaseNotificationTask.findOneAndUpdate(
    { url: task.url },
    { $set: task },
    { upsert: true, returnDocument: "after" },
  )) || DIE("never");

if (import.meta.main) {
  await runGithubDesktopReleaseNotificationTask();
  if (isCI) {
    await db.close();
    process.exit(0); // exit if running in CI
  }
}

async function runGithubDesktopReleaseNotificationTask() {
  const pSlackChannelId = getSlackChannel(config.slackChannel).then(
    (e) => e.id || DIE(`unable to get slack channel ${config.slackChannel}`),
  );

  await sflow(config.repos)
    .map(parseGithubRepoUrl)
    .flatMap(({ owner, repo }) =>
      gh.repos
        .listReleases({
          owner,
          repo,
          per_page: 3,
        })
        .then((e) => e.data),
    )
    .map(async (release) => {
      const url = release.html_url;
      const status = release.draft ? "draft" : release.prerelease ? "prerelease" : "stable";

      // create task
      let task = await save({
        url,
        status: status,
        isStable: status == "stable",
        version: release.tag_name,
        coreVersion: (release.body || release.body_text)?.match(coreVersionPattern)?.[1],
        createdAt: new Date(
          release.created_at || DIE("no created_at in release, " + JSON.stringify(release)),
        ),
        releasedAt: !release.published_at ? undefined : new Date(release.published_at),
      });
      const coreTask = !task.coreVersion
        ? undefined
        : await GithubReleaseNotificationTask.findOne({ version: task.coreVersion });

      if (+task.createdAt! < +new Date(config.sendSince)) return task; // skip releases before the sendSince date

      const newSlackMessage = {
        channel: await pSlackChannelId,
        text: config.slackMessage
          .replace("{url}", task.url)
          .replace(
            "{repo}",
            parseGithubUrl(task.url)?.repo || DIE(`unable parse REPO from URL ${task.url}`),
          )
          .replace(
            "{version}",
            task.version || DIE(`unable to parse version from task ${JSON.stringify(task)}`),
          )
          .replace("{status}", task.status)
          .replace(/$/, !coreTask?.version ? "" : " Core: " + coreTask.version),
      };

      // upsert drafting message if new/changed
      const shouldSendDraftingMessage = !task.isStable || task.slackMessageDrafting?.url;
      if (
        shouldSendDraftingMessage &&
        task.slackMessageDrafting?.text?.trim() !== newSlackMessage.text.trim()
      ) {
        task = await save({
          url,
          slackMessageDrafting: await upsertSlackMessage({
            ...newSlackMessage,
            replyUrl: coreTask?.slackMessageDrafting?.url,
          }),
        });
      }

      // upsert stable message if new/changed
      const shouldSendMessage = task.isStable || task.slackMessage?.url;
      if (shouldSendMessage && task.slackMessage?.text?.trim() !== newSlackMessage.text.trim()) {
        // const replyUrl =
        //   coreTask?.slackMessageDrafting?.url || coreTask?.slackMessage?.url || task.slackMessageDrafting?.url;
        task = await save({
          url,
          slackMessage: await upsertSlackMessage({
            ...newSlackMessage,
            // replyUrl: replyUrl,
            // reply_broadcast: replyUrl ? true : false,
          }),
        });
      }
      return task;
    })
    .log()
    .run();
}

export default runGithubDesktopReleaseNotificationTask;
