#!/usr/bin/env bun --watch

/**
 * Github Bugcop Bot
 * 1. bot matches issues for label "bug-cop:ask-for-info"
 * 2. if user have added context, remove "bug-cop:ask-for-info" and add "bug-cop:response-received"
 */

// for repo
import { github } from "@/lib";
import { db } from "@/src/db";
import { MetaCollection } from "@/src/db/TaskMeta";
import { type GH } from "@/lib/github";
import { ghPageFlow } from "@/src/ghPageFlow";
import { ghc } from "@/lib/github/githubCached";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import KeyvSqlite from "@keyv/sqlite";
import DIE from "@snomiao/die";
import chalk from "chalk";
import { compareBy } from "comparing";
import fastDiff from "fast-diff";
import { mkdir } from "fs/promises";
import isCI from "is-ci";
import Keyv from "keyv";
import KeyvMongodbStore from "keyv-mongodb-store";
import KeyvNest from "keyv-nest";
import { union } from "rambda";
import sflow, { pageFlow } from "sflow";
import z from "zod";
import { createTimeLogger } from "../../app/tasks/gh-design/createTimeLogger";
import { tsmatch } from "@/packages/mongodb-pipeline-ts/Task";

export const REPOLIST = [
  "https://github.com/Comfy-Org/ComfyUI",
  "https://github.com/Comfy-Org/Comfy-PR",
  "https://github.com/Comfy-Org/ComfyUI_frontend",
  "https://github.com/Comfy-Org/desktop",
];
await mkdir("./.cache", { recursive: true });
const kv = new Keyv({ store: new KeyvSqlite("sqlite://.cache/bugcop-cache.sqlite") });
function createKeyvCachedFn<FN extends (...args: unknown[]) => Promise<unknown>>(
  key: string,
  fn: FN,
): FN {
  return (async (...args) => {
    const mixedKey = key + "(" + JSON.stringify(args) + ")";
    if (await kv.has(mixedKey)) return await kv.get(mixedKey);
    const ret = await fn(...args);
    await kv.set(mixedKey, ret);
    return ret;
  }) as FN;
}

const DEBUG_CACHE = !!process.env.VERBOSE;

const State = new Keyv(
  KeyvNest(
    new Map(),
    // new KeyvNedbStore(".cache/bugcop-state.jsonl"),
    new KeyvMongodbStore(db.collection("TaskMetaStore"), { namespace: "GithubBugcopTask" }),
  ),
);

const CheckpointPrefix = "bugcop-checkpoint-";
export const BUGCOP_ASKING_FOR_INFO = "bug-cop:ask-for-info" as const; // asking user for more info
export const BUGCOP_ANSWERED = "bug-cop:answered" as const; // an issue is answered by ComfyOrg Team member
export const BUGCOP_RESPONSE_RECEIVED = "bug-cop:response-received" as const; // user has responded ask-for-info or answered label
export const GithubBugcopTaskDefaultMeta = {
  repoUrls: REPOLIST,
  matchLabel: [BUGCOP_ASKING_FOR_INFO],
};

export type GithubBugcopTask = {
  url: string; // the issue URL

  status?:
    // | "ask-for-info" // deprecated, use "askForInfo" instead, this may still in db
    // | "answered"  // deprecated, use "responseReceived" instead, this may still in db

    | "askForInfo" // user has not answered yet, but we have ask-for-info label
    | "responseReceived" // user has answered the issue, so we can remove the askForInfo
    | "closed"; // issue is closed, so we can remove all bug-cop labels
  statusReason?: string; // reason for the status, for example, "no new comments" or "body updated"
  updatedAt?: Date; // the last updated time of the issue, for diff checking

  body?: string; // body of the issue, for diff checking

  // caches
  user?: string; // the user who created the issue
  labels?: string[]; // labels of the issue, just cache
  timeline?: (
    | GH["labeled-issue-event"]
    | GH["timeline-comment-event"]
    | GH["unlabeled-issue-event"]
  )[]; // timeline events of the issue, just cache

  // task status for task scheduler
  taskStatus?: "processing" | "ok" | "error";
  taskAction?: string; // if processing, can be use for rollback or undo
  lastChecked?: Date; // last updated time of the issue
};
export const zGithubBugcopTaskMeta = z.object({
  repoUrls: z.url().array(),
});
export const GithubBugcopTask = db.collection<GithubBugcopTask>("GithubBugcopTask");
export const GithubBugcopTaskMeta = MetaCollection(GithubBugcopTask, zGithubBugcopTaskMeta);

const tlog = createTimeLogger();
const isDryRun = process.env.DRY_RUN === "true" || process.argv.slice(2).includes("--dry");

if (import.meta.main) {
  await runGithubBugcopTask();
  if (isCI) {
    await db.close();
    process.exit();
  }
}

/**
 * Fetch issues from a repo using GraphQL with checkpoint-based pagination
 * This is much more efficient than REST API as it fetches labels, timeline, and comments in a single query
 */
async function fetchRepoIssuesWithGraphQL(
  repoUrl: string,
  matchingLabels: string[],
): Promise<GH["issue"][]> {
  const { owner, repo } = parseGithubRepoUrl(repoUrl);
  const checkpointKey = CheckpointPrefix + repoUrl;
  const checkpoint = await State.get<string>(checkpointKey);

  console.log(`[graphql] ${repoUrl}/issues scanning from checkpoint: ${checkpoint || "beginning"}`);

  const allIssues: GH["issue"][] = [];

  // Fetch issues for each label separately and combine results
  for (const label of matchingLabels) {
    await pageFlow(
      {
        endCursor: null as null | string,
        updatedGt: checkpoint || "",
      },
      async (cursor, pageSize = 100) => {
        const endCursor = cursor.endCursor;
        const updatedGt = cursor.updatedGt;

        const resp = (await Promise.race([
          github.graphql(
            `
      query fetchBugcopIssues {
        search(
          query: "repo:${owner}/${repo} is:open label:\\"${label}\\" sort:updated-asc${updatedGt ? ` updated:>${updatedGt}` : ""}",
          type: ISSUE,
          first: ${pageSize},
          after: ${JSON.stringify(endCursor)}
        ) {
          issueCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Issue {
              number
              title
              body
              state
              updatedAt
              createdAt
              url
              author {
                login
              }
              repository {
                name
                owner { login }
              }

              # Get current labels
              labels(first: 100) {
                nodes { name }
              }

              # Get recent timeline events for labels and comments
              timelineItems(last: 100, itemTypes: [LABELED_EVENT, UNLABELED_EVENT, ISSUE_COMMENT]) {
                nodes {
                  ... on LabeledEvent {
                    event: __typename
                    createdAt
                    label { name }
                    actor { login }
                  }
                  ... on UnlabeledEvent {
                    event: __typename
                    createdAt
                    label { name }
                    actor { login }
                  }
                  ... on IssueComment {
                    event: __typename
                    createdAt
                    updatedAt
                    author {
                      login
                    }
                    authorAssociation
                    body
                  }
                }
              }
            }
          }
        }
      }`.replace(/ +/g, " "),
          ),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("GraphQL query timeout after 30s - likely rate limited")),
              30000,
            ),
          ),
        ])) as {
          search: {
            issueCount: number;
            pageInfo: {
              hasNextPage: boolean;
              endCursor: string | null;
            };
            nodes: Array<{
              number: number;
              title: string;
              body: string | null;
              state: string;
              updatedAt: string;
              createdAt: string;
              url: string;
              author: { login: string } | null;
              repository: { name: string; owner: { login: string } };
              labels: { nodes: { name: string }[] };
              timelineItems: {
                nodes: Array<
                  | {
                      event: "LabeledEvent";
                      createdAt: string;
                      label: { name: string } | null;
                      actor: { login: string };
                    }
                  | {
                      event: "UnlabeledEvent";
                      createdAt: string;
                      label: { name: string } | null;
                      actor: { login: string };
                    }
                  | {
                      event: "IssueComment";
                      createdAt: string;
                      updatedAt: string;
                      author: { login: string } | null;
                      authorAssociation: string;
                      body: string;
                    }
                >;
              };
            }>;
          };
        };

        console.debug(
          `[graphql] Fetched ${resp.search.nodes.length}/${resp.search.issueCount} issues with label "${label}" from ${repoUrl} updated since ${updatedGt || "beginning"}`,
        );

        // Convert GraphQL response to REST API format
        const issues = resp.search.nodes.map((node) => {
          const issue: GH["issue"] = {
            id: node.number,
            number: node.number,
            title: node.title,
            body: node.body,
            state: node.state.toLowerCase() as "open" | "closed",
            updated_at: node.updatedAt,
            created_at: node.createdAt,
            html_url: node.url,
            user: node.author ? { login: node.author.login } : null,
            labels: node.labels.nodes.map((l) => ({ name: l.name })),
            // Store timeline in a cache property for later use
            _timeline: node.timelineItems.nodes,
          } as unknown as GH["issue"];
          return issue;
        });

        allIssues.push(...issues);

        // Update checkpoint
        if (issues.length > 0) {
          const lastIssue = issues[issues.length - 1];
          await State.set(checkpointKey, lastIssue.updated_at);
        }

        const nextEndCursor = resp.search.pageInfo.hasNextPage
          ? resp.search.pageInfo.endCursor
          : null;
        const nextUpdatedGt = nextEndCursor
          ? updatedGt
          : issues.length
            ? issues[issues.length - 1].updated_at
            : "";
        const next =
          !nextUpdatedGt && !nextEndCursor
            ? null
            : {
                endCursor: nextEndCursor,
                updatedGt: nextUpdatedGt,
              };

        return { data: resp.search.nodes, next };
      },
    )
      .flat()
      .run();
  }

  // Deduplicate issues by URL
  const uniqueIssues = Array.from(
    new Map(allIssues.map((issue) => [issue.html_url, issue])).values(),
  );

  return uniqueIssues;
}

/**
 * Convert GraphQL timeline events to REST API format
 */
function convertGraphQLTimelineToREST(
  timelineNodes: Array<
    | {
        event: "LabeledEvent";
        createdAt: string;
        label: { name: string } | null;
        actor: { login: string };
      }
    | {
        event: "UnlabeledEvent";
        createdAt: string;
        label: { name: string } | null;
        actor: { login: string };
      }
    | {
        event: "IssueComment";
        createdAt: string;
        updatedAt: string;
        author: { login: string } | null;
        authorAssociation: string;
        body: string;
      }
  >,
): (GH["labeled-issue-event"] | GH["timeline-comment-event"] | GH["unlabeled-issue-event"])[] {
  return timelineNodes.map((node) => {
    if (node.event === "LabeledEvent") {
      return {
        event: "labeled" as const,
        created_at: node.createdAt,
        label: node.label || { name: "" },
        actor: node.actor,
      } as GH["labeled-issue-event"];
    } else if (node.event === "UnlabeledEvent") {
      return {
        event: "unlabeled" as const,
        created_at: node.createdAt,
        label: node.label || { name: "" },
        actor: node.actor,
      } as GH["unlabeled-issue-event"];
    } else {
      // IssueComment
      return {
        event: "commented" as const,
        created_at: node.createdAt,
        updated_at: node.updatedAt,
        user: node.author ? { login: node.author.login } : null,
        author_association: node.authorAssociation,
        body: node.body,
      } as GH["timeline-comment-event"];
    }
  });
}

export default async function runGithubBugcopTask() {
  tlog("Running Github Bugcop Task...");
  const matchingLabels = [BUGCOP_ASKING_FOR_INFO, BUGCOP_ANSWERED];

  // Fetch all issues using GraphQL for better performance
  const allIssues = await sflow(REPOLIST)
    .flatMap(async (repoUrl) => {
      const issues = await fetchRepoIssuesWithGraphQL(repoUrl, matchingLabels);
      return issues;
    })
    .toArray();

  const openningIssues = await sflow(allIssues).forEach(processIssue).toArray();

  tlog(`Processed ${openningIssues.length} open issues`);

  // once openning issues are processed,
  // now we should process the issues in db that's not openning anymore
  const existingTasks = await sflow(
    GithubBugcopTask.find({
      url: { $nin: openningIssues.map((e) => e.html_url) },
    }),
  )
    .map((task) => task.url)
    .map(
      async (issueUrl) => await ghc.issues.get({ ...parseIssueUrl(issueUrl) }).then((e) => e.data),
    )
    .forEach(processIssue)
    .toArray();

  tlog(
    chalk.green(
      "Processed " + existingTasks.length + " existing tasks that are not openning/labeled anymore",
    ),
  );

  tlog(chalk.green("All Github Bugcop Task completed successfully!"));
}

async function processIssue(issue: GH["issue"]) {
  const url = issue.html_url;
  const issueId = parseIssueUrl(issue.html_url);
  let task = await GithubBugcopTask.findOne({ url });
  const saveTask = async (data: Partial<GithubBugcopTask>) =>
    (task =
      (await GithubBugcopTask.findOneAndUpdate(
        { url },
        { $set: { updatedAt: new Date(), ...data } },
        { returnDocument: "after", upsert: true },
      )) || DIE("never"));

  const issueLabels = issue.labels
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter(Boolean);
  task = await saveTask({
    taskStatus: "processing",
    user: issue.user?.login,
    labels: issueLabels,
    updatedAt: new Date(issue.updated_at),
  });

  if (issue.state === "closed") {
    if (task.status !== "closed") {
      tlog(chalk.bgRedBright("Issue is closed: " + issue.html_url));
    }
    return await saveTask({ status: "closed", lastChecked: new Date() });
  }

  // check if the issue body is updated since last successful scan
  if (!task.body) await saveTask({ body: issue.body ?? undefined });
  const isBodyAddedContent =
    issue.body &&
    task.body &&
    issue.body !== task.body &&
    fastDiff(task.body ?? "", issue.body ?? "").filter(([op, val]) => op === fastDiff.INSERT)
      .length > 0; // check if the issue body has added new content after the label added time

  tlog(chalk.bgBlackBright("Processing Issue: " + issue.html_url));
  tlog(chalk.bgBlue("Labels: " + JSON.stringify(issueLabels)));

  // Use cached timeline from GraphQL if available, otherwise fetch from REST API
  const timeline = (await ghPageFlow(ghc.issues.listEventsForTimeline)(
    issueId,
  ).toArray()) as GH["timeline-issue-events"][];

  // list all label events
  const labelEvents = await sflow([...timeline])
    .map((e) =>
      tsmatch(e)
        .with({ event: "labeled" }, (e) => e as GH["labeled-issue-event"])
        .with({ event: "unlabeled" }, (e) => e as GH["unlabeled-issue-event"])
        .with({ event: "commented" }, (e) => e as GH["timeline-comment-event"])
        .otherwise(() => null),
    )
    .filter()
    .toArray(); // as TimelineEvent[];
  tlog("Found " + labelEvents.length + " unlabeled/labeled/commented events");
  await saveTask({ timeline: labelEvents as GithubBugcopTask["timeline"] });

  function lastLabeled(labelName: string) {
    return labelEvents
      .filter((e): e is GH["labeled-issue-event"] => e.event === "labeled")
      .filter((e) => e.label?.name === labelName)
      .sort(compareBy((e) => e.created_at))
      .reverse()[0];
  }

  const latestLabeledEvent = lastLabeled(BUGCOP_ASKING_FOR_INFO) || lastLabeled(BUGCOP_ANSWERED);
  if (!latestLabeledEvent) {
    lastLabeled(BUGCOP_RESPONSE_RECEIVED) ||
      DIE`No labeled event found, this should not happen since we are filtering issues by those label, ${JSON.stringify(task.labels)}`;

    return task;
  }

  // check if it's answered since lastLabel
  const hasNewComment = (() => {
    const labelLastAddedTime = new Date(latestLabeledEvent?.created_at ?? 0);
    const commentEvents = timeline
      .filter((e): e is GH["timeline-comment-event"] => e.event === "commented")
      .filter((e) => e.user) // filter out comments without user
      .filter((e) => !e.user?.login.match(/\[bot\]$|-bot/)) // no bots
      .filter(
        (e) =>
          +new Date((e as Record<string, unknown>).updated_at as string) >
          +new Date(labelLastAddedTime),
      ) // only comments that is updated later than the label added time
      .filter(
        (e) =>
          !["COLLABORATOR", "CONTRIBUTOR", "MEMBER", "OWNER"].includes(
            ((e as Record<string, unknown>).author_association ?? "") as string,
          ),
      ) // not by collaborators, usually askForInfo for more info
      .filter((e) => e.user?.login !== latestLabeledEvent?.actor?.login); // ignore the user who added the label

    commentEvents.length &&
      tlog(
        chalk.bgGreen(
          "Found " + commentEvents.length + " comments after last added time for " + issue.html_url,
        ),
      );
    return !!commentEvents.length;
  })();

  const isResponseReceived = hasNewComment || isBodyAddedContent; // check if user responsed info by new comment or body updated since last scanned
  if (!isResponseReceived) {
    return await saveTask({
      taskStatus: "ok",
      lastChecked: new Date(),
    });
  }

  const addLabels = [BUGCOP_RESPONSE_RECEIVED].filter((e) => !issueLabels.includes(e)); // add response received label if not already added
  const removeLabels = [latestLabeledEvent?.label?.name].filter(
    (e): e is string => !!e && issueLabels.includes(e),
  ); // remove the triggering label if it exists on the issue

  if (isResponseReceived) {
    addLabels.length && console.log(chalk.bgBlue("Adding:"), addLabels);
    removeLabels.length && console.log(chalk.bgBlue("Removing:"), removeLabels);
  }

  if (isDryRun) return task;

  await sflow(addLabels)
    .forEach((label) => tlog(`Adding label ${label} to ${issue.html_url}`))
    .map((label) => github.rest.issues.addLabels({ ...issueId, labels: [label] }))
    .run();
  await sflow(removeLabels)
    .forEach((label) => tlog(`Removing label ${label} from ${issue.html_url}`))
    .map((label) =>
      github.rest.issues.removeLabel({ ...issueId, name: label }).catch(console.error),
    )
    .run();

  return await saveTask({
    // status,
    statusReason: isBodyAddedContent ? "body updated" : hasNewComment ? "new comment" : "unknown",
    taskStatus: "ok",
    lastChecked: new Date(),
    labels: union(task.labels || [], addLabels).filter((e) => !removeLabels.includes(e)),
  });
}
