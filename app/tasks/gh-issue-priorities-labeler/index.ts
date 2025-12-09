#!/usr/bin/env bun --hot
import { db } from "@/src/db";
import { parseIssueUrl } from "@/src/parseIssueUrl";
import KeyvSqlite from "@keyv/sqlite";
import Notion from "@notionhq/client";
import DIE from "@snomiao/die";
import Keyv from "keyv";
import KeyvCacheProxy, { globalThisCached } from "keyv-cache-proxy";
import KeyvMongodbStore from "keyv-mongodb-store";
import KeyvNedbStore from "keyv-nedb-store";
import KeyvNest from "keyv-nest";
import { Octokit } from "octokit";
import { pageFlow } from "sflow";

const State = new Keyv(
  KeyvNest(
    new Map(),
    // new KeyvNedbStore('.cache/gh-issue-priorities.nedb.yml'), // debuggable state store
    new KeyvMongodbStore(db.collection("GithubIssuePrioritiesState")), // persist to prod mongodb
  ),
);

const CHECKPOINT = "checkpoint";
// await State.delete(CHECKPOINT); // reset checkpoint for testing

const _github = new Octokit({ auth: process.env.GH_TOKEN_COMFY_PR_BOT }).rest;
const _notion = new Notion.Client({ auth: process.env.NOTION_TOKEN });

const github = KeyvCacheProxy({
  store: globalThisCached("github", () => new Keyv(KeyvNest(new Map(), new KeyvNedbStore(".cache/github.nedb.yaml")))),
  prefix: "github.",
})(_github);

const notion = KeyvCacheProxy({
  store: globalThisCached("notion", () => new Keyv(KeyvNest(new Map(), new KeyvSqlite(".cache/notion.sqlite")))),
  prefix: "notion.",
  onFetched: (key, val) => {
    console.log(JSON.stringify(val).length + " < " + key);
    // for dataSources query endpoint, only results with max-size with next_cursor
    if (key.startsWith("notion.dataSources.query")) {
      if (!val?.next_cursor) {
        console.log(`Skipped incompleted data: ${key}`);
        return { skip: true };
      }
    }
  },
})(_notion);

const notionPriorityToGithubLabelsMap = {
  High: "High-Priority",
  Medium: "Medium-Priority",
  Low: "Low-Priority",
};
const mapNotionPriorityToGithubLabel = (priority: string) =>
  (notionPriorityToGithubLabelsMap as Record<string, string>)[priority] || DIE(`Unknown priority: ${priority}`);

const notionComfyTasks = "https://www.notion.so/bf086637f74c4292ae588ab84ff18550";

if (import.meta.main) {
  await GithubIssuePrioritiesLabler();
}
async function GithubIssuePrioritiesLabler() {
  const st = Date.now() / 1000;
  // Fetch the Comfy tasks database
  console.log("Fetching Comfy tasks database...");
  const database_id = notionComfyTasks.split("/").pop()!;
  const database = (await notion.databases.retrieve({ database_id })) as Notion.DatabaseObjectResponse;
  const data_source_id = database.data_sources[0].id;

  console.log("Database info:", JSON.stringify(database));

  // // Query the database to get tasks
  // console.log('\nFetching tasks from database...');
  // // full scan + incremental watching
  const checkpoint = await State.get<{
    id: string;
    editedAt: string;
  }>(CHECKPOINT);
  // scan all edited pages
  const tasks = await pageFlow(checkpoint?.id ?? (undefined as string | undefined), async (cursor, page_size = 100) => {
    // console.log(`Querying Notion data source ${data_source_id} with cursor=${cursor} page_size=${page_size}...`);
    const ret = await notion.dataSources.query({
      data_source_id,
      result_type: "page",
      filter: {
        and: [
          { property: "[GH🤖] Link", url: { is_not_empty: true } },
          { property: "Priority", select: { is_not_empty: true } },
        ],
      },
      sorts: [{ direction: "ascending", timestamp: "last_edited_time" }],
      page_size,
      start_cursor: cursor,
    });
    // ret.next_cursor && await State.set(CHECKPOINT, ret.next_cursor);
    return { next: ret.next_cursor, data: ret.results };
  })
    .flat()
    .map((e) => e as Notion.PageObjectResponse)
    .filter((e) => e.id !== checkpoint?.id) // skip checkpoint entry as it's already processed
    .map(async (e: any) => {
      return {
        ...e,
        Title: e.properties.Task?.title?.[0]?.plain_text,
        Priority: e.properties.Priority?.select?.name,
        issueUrl: e.properties["[GH🤖] Link"]?.url.trim(),
      };
    })
    .forEach(async (e) => {
      if (!(e.Title && e.Priority.trim() && e.issueUrl.trim())) return;
      const priorityLabels = [mapNotionPriorityToGithubLabel(e.Priority)].filter(Boolean);
      console.log(`Processing task ${e.id} - ${e.issueUrl} with priority ${e.Priority} -> labels:`, priorityLabels);

      const originalLabelsResp = await github.issues.listLabelsOnIssue({ ...parseIssueUrl(e.issueUrl) });
      const originalLabels = originalLabelsResp.data.map((l) => l.name);

      const missingLabels = priorityLabels.filter((l) => !originalLabels.includes(l));
      const obsolateLabels = ["High-Priority", "Medium-Priority", "Low-Priority"].filter(
        (l) => originalLabels.includes(l) && !priorityLabels.includes(l),
      );

      console.log(
        `Modifying Labels ${e.issueUrl}: `,
        missingLabels.map((e) => "+" + e),
        obsolateLabels.map((e) => "-" + e),
      );

      if (missingLabels.length === 0 && obsolateLabels.length === 0) {
        console.log(`No label changes needed for ${e.issueUrl}`);
        await State.set(CHECKPOINT, { id: e.id, editedAt: e.last_edited_time }); // per-item checkpoint, can resume from last processed page
        return;
      }

      // remove obsolate labels
      for (const l of obsolateLabels) {
        // console.log(`Removing label ${l} from ${e.issueUrl}`);
        await github.issues
          .removeLabel({
            ...parseIssueUrl(e.issueUrl),
            name: l,
          })
          .catch((err) => {
            console.warn(`Failed to remove label ${l} from ${e.issueUrl}:`, err.message);
          });
        // console.log(`Removed label ${l} from ${e.issueUrl}`);
      }

      if (missingLabels.length !== 0) {
        // console.log(`Adding labels to ${e.issueUrl}:`, missingLabels);
        await github.issues.addLabels({
          ...parseIssueUrl(e.issueUrl),
          labels: missingLabels,
        });
      }

      console.log(`Labeled issue/pr ${e.issueUrl} with labels:`, priorityLabels);
      await State.set(CHECKPOINT, { id: e.id, editedAt: e.last_edited_time }); // per-item checkpoint, can resume from last processed page
    })
    .filter((e) => e.Title) // only with title
    .filter((e) => e.Priority.trim()) // only with priority
    .filter((e) => e.issueUrl) // github issue or pull url
    .log((e) => `+task: ${e.id} \t ${e.Priority || "_".repeat(10)} \t ${e.issueUrl || " ".repeat(30)} \t ${e.Title}`)
    .toArray();

  console.log("Tasks:", JSON.stringify(tasks.length, null, 2));

  const et = Date.now() / 1000;
  console.log(`Done in ${(et - st).toFixed(2)} seconds.`);
}

export default GithubIssuePrioritiesLabler;
