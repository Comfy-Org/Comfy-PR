#!/usr/bin/env bun
import KeyvSqlite from "@keyv/sqlite";
import DIE from "@snomiao/die";
import * as crypto from "crypto";
import Keyv from "keyv";
import sflow, { pageFlow } from "sflow";
import { match, P } from "ts-pattern";
import type { UnionToIntersection } from "type-fest";
import { gh, type GH } from "@/lib/github";
import { ghc } from "@/lib/github/githubCached";
import { parseGithubRepoUrl } from "@/src/parseOwnerRepo";
import { processIssueCommentForLableops } from "./easylabel";
import type { WebhookEventMap } from "@octokit/webhooks-types";

export const REPOLIST = [
  "https://github.com/Comfy-Org/Comfy-PR",
  "https://github.com/comfyanonymous/ComfyUI",
  "https://github.com/Comfy-Org/ComfyUI_frontend",
  "https://github.com/Comfy-Org/desktop",
];

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET; // generate one with `openssl rand -hex 32`
const WEBHOOK_BASE_URL = process.env.GITHUB_WEBHOOK_BASEURL;
const WEBHOOK_URL = WEBHOOK_BASE_URL?.replace(/$/, `/api/github/webhook`);

interface RepoMonitorState {
  lastCheckTime: Date;
  lastIssueId: number;
  lastPRId: number;
}

type WebhookIssue = GH[`webhook-issues-${string}` & keyof GH];
type WebhookIssueComment = GH[`webhook-issue-comment-${string}` & keyof GH];
type WebhookPullRequest = GH[`webhook-pull-request-${string}` & keyof GH];
type WebhookPullRequestReview = GH[`webhook-pull-request-review${string}` & keyof GH];
type WebhookPullRequestReviewComment = GH[`webhook-pull-request-review-comment-${string}` &
  keyof GH];
type HaveBody<T> = T extends { issue: { body: string } } ? T : never;
type test = HaveBody<GH[`webhook-${string}-${string}` & keyof GH]>;
type WebhookAll = GH[`webhook-${string}-${string}` & keyof GH];
// Extract webhook payloads that include textual bodies on issue or pull_request
type WebhookIntersection = UnionToIntersection<{ a: 1 } | { b: 1 }>;
type Webhook =
  | WebhookIssue
  | WebhookIssueComment
  | WebhookPullRequest // including review comment
  | GH[`webhook-pull-request-review-comment-${string}` & keyof GH];

class RepoEventMonitor {
  private monitorState = new Map<string, RepoMonitorState>();
  private stateCache: Keyv<RepoMonitorState>;
  private pollingRepos = new Set<string>();
  private pollInterval = 30000; // 30 seconds
  private webhookSetupComplete = false;

  constructor() {
    // Initialize SQLite cache
    const sqlite = new KeyvSqlite("gh-service/state.sqlite");
    this.stateCache = new Keyv({ store: sqlite });

    // Initialize state for each repo
    for (const repoUrl of REPOLIST) {
      const { owner, repo } = this.parseRepoUrl(repoUrl);
      const key = `${owner}/${repo}`;
      this.monitorState.set(key, {
        lastCheckTime: new Date(),
        lastIssueId: 0,
        lastPRId: 0,
      });
    }
  }

  private parseRepoUrl(url: string): { owner: string; repo: string } {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
    return { owner: match[1], repo: match[2] };
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private async loadStateFromCache(): Promise<void> {
    for (const repoUrl of REPOLIST) {
      const { owner, repo } = this.parseRepoUrl(repoUrl);
      const key = `${owner}/${repo}`;

      try {
        const cachedState = await this.stateCache.get(key);
        if (cachedState) {
          // Convert date strings back to Date objects
          cachedState.lastCheckTime = new Date(cachedState.lastCheckTime);
          this.monitorState.set(key, cachedState);
        }
      } catch (error) {
        console.error(`[${this.formatTimestamp()}] Error loading cached state for ${key}:`, error);
      }
    }
  }

  private async saveStateToCache(key: string, state: RepoMonitorState): Promise<void> {
    try {
      await this.stateCache.set(key, state);
    } catch (error) {
      console.error(`[${this.formatTimestamp()}] Error saving state to cache for ${key}:`, error);
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature) return false;
    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", WEBHOOK_SECRET || DIE("MISSING env.WEBHOOK_SECRET"))
      .update(payload)
      .digest("hex")}`;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }
  async webhookRequestHandler(req: Request): Promise<Response> {
    const signature = req.headers.get("x-hub-signature-256") || "";
    const event = req.headers.get("x-github-event") || "";
    const body = await req.text();

    if (!this.verifyWebhookSignature(body, signature))
      return new Response("Unauthorized", { status: 401 });

    const payload = JSON.parse(body);
    this.handleWebhookEvent({ [event]: payload });
    return new Response("OK");
  }

  private async handleWebhookEvent(event: Partial<WebhookEventMap>) {
    const timestamp = this.formatTimestamp();
    // const repo = event.payload.repository;
    // const repoName = repo ? `${repo.owner.login}/${repo.name}` : "unknown";

    match(event)
      .with({ issue_comment: P.select(P.nonNullable) }, async (payload) => {
        if ("issue" in payload && "comment" in payload) {
          await processIssueCommentForLableops({
            issue: payload.issue as GH["issue"],
            comment: payload.comment as GH["issue-comment"],
          });
        }
      })
      .otherwise(() => null);

    // match(event)
    //   .with({ type: "pull_request" }, ({ type, payload }) => payload.comment.body)
    //   .with({ type: "pull_request" }, ({ type, payload }) => payload.pull_request.body)
    //   .with({ type: "pull_request" }, ({ type, payload }) => payload.pull_request.body)
    //   .with({ type: "issues" }, ({ type, payload }) =>
    //     match(payload).with({ action: P.union("opened", "edited") }, ({ issue }) => issue.body),
    //   )
    //   // .with({ payload: { comment: { body: P.string } } }, ({ type, payload }) =>
    //   //   console.log("WEBHOOK " + type+ ' ' + payload.action + " " + payload.comment.body),
    //   // )
    //   // .with({ payload: { issue: { body: P.string } } }, ({ type, payload }) =>
    //   //   console.log("WEBHOOK " + type+ ' ' + payload.action + " " + payload.issue.body),
    //   // )
    //   // .with({ payload: { pull_request: { body: P.string } } }, ({ type, payload }) =>
    //   //   console.log("WEBHOOK " + type+ ' ' + payload.action + " " + payload.pull_requests.body),
    //   // )
    //   // .with("issue_comment", () =>
    //   //   console.log("WEBHOOK " + type + " " + payload.action + " " + payload.issue.html_url),
    //   // )

    //   // .with("pull_request", () => this.handlePREvent(payload as WebhookPullRequest, timestamp, repoName))
    //   // .with("pull_request_review", () =>
    //   //   this.handlePRReviewEvent(
    //   //     payload as GH[`webhook-pull-request-review-${string}` & keyof GH],
    //   //     timestamp,
    //   //     repoName,
    //   //   ),
    //   // )
    //   // .with("pull_request_review_comment", () =>
    //   //   this.handlePRReviewEvent(payload as WebhookPullRequestReviewComment, timestamp, repoName),
    //   // )

    //   // .with("label", () => this.handleLabelEvent(payload, timestamp, repoName))
    //   .with({ action: P.string }, ({ type, payload }) => {
    //     console.log(`[${timestamp}] 📥 WEBHOOK: ${type} ${payload.action} ${repoName}`);
    //   })
    //   .otherwise(() => {
    //     console.log(`[${timestamp}] 📥 WEBHOOK: ${type} ${repoName}`);
    //   });
  }

  // private handlePREvent(payload: WEBHOOK_EVENT, timestamp: string, repoName: string): void {
  //   const { action, pull_request, sender } = payload;
  //   const prNumber = pull_request?.number;
  //   const prTitle = pull_request?.title;
  //   const username = sender?.login;

  //   match(action)
  //     .with("opened", () =>
  //       console.log(`[${timestamp}] 🔄 NEW PR (WEBHOOK): ${repoName}#${prNumber} - ${prTitle} by ${username}`),
  //     )
  //     .with("closed", () => {
  //       const merged = pull_request?.merged;
  //       if (merged) {
  //         console.log(`[${timestamp}] 🎉 PR MERGED (WEBHOOK): ${repoName}#${prNumber} by ${username}`);
  //       } else {
  //         console.log(`[${timestamp}] ❌ PR CLOSED (WEBHOOK): ${repoName}#${prNumber} by ${username}`);
  //       }
  //     })
  //     .with("reopened", () =>
  //       console.log(`[${timestamp}] 🔄 PR REOPENED (WEBHOOK): ${repoName}#${prNumber} by ${username}`),
  //     )
  //     .with("labeled", "unlabeled", () => {
  //       const label = payload.label?.name;
  //       console.log(
  //         `[${timestamp}] 🏷️  PR ${action!.toUpperCase()} (WEBHOOK): ${repoName}#${prNumber} - ${label} by ${username}`,
  //       );
  //     })
  //     .otherwise(() =>
  //       console.log(`[${timestamp}] 📝 PR ${action?.toUpperCase()} (WEBHOOK): ${repoName}#${prNumber} by ${username}`),
  //     );
  // }

  // private handlePRReviewEvent(
  //   payload: GH[`webhook-pull-request-review-${string}` & keyof GH],
  //   timestamp: string,
  //   repoName: string,
  // ): void {
  //   const { action, pull_request, sender } = payload;
  //   const prNumber = pull_request?.number;
  //   const username = sender?.login;

  //   if (action === "created" || action === "submitted") {
  //     console.log(`[${timestamp}] 🔍 NEW PR REVIEW COMMENT (WEBHOOK): ${repoName}#${prNumber} by ${username}`);
  //   }
  // }

  // private handleLabelEvent(payload: Webhook, timestamp: string, repoName: string): void {
  //   const { action, label, sender } = payload;
  //   const labelName = label?.name;
  //   const username = sender?.login;

  //   console.log(
  //     `[${timestamp}] 🏷️  LABEL ${action?.toUpperCase()} (WEBHOOK): ${repoName} - ${labelName} by ${username}`,
  //   );
  // }
  async setupWebhooks(): Promise<void> {
    if (this.webhookSetupComplete) return;

    console.log(`[${this.formatTimestamp()}] Setting up webhooks for repositories...`);

    for (const repoUrl of REPOLIST) {
      try {
        const { owner, repo } = this.parseRepoUrl(repoUrl);

        // Check if webhook already exists
        let existingHook;
        try {
          const { data: hooks } = await gh.repos.listWebhooks({ owner, repo });
          existingHook = hooks.find((hook) => hook.config?.url === WEBHOOK_URL);

          if (existingHook) {
            console.log(
              `[${this.formatTimestamp()}] ✅ Webhook already exists for ${owner}/${repo}`,
            );
            continue;
          }
        } catch (listError: any) {
          if (listError.status === 403 || listError.status === 404) {
            console.warn(
              `[${this.formatTimestamp()}] ⚠️  No permission to list webhooks for ${owner}/${repo}. Falling back to polling.`,
            );
            this.pollingRepos.add(repoUrl);
            continue;
          }
          throw listError;
        }

        // Create webhook
        await gh.repos.createWebhook({
          owner,
          repo,
          config: {
            url: WEBHOOK_URL,
            content_type: "json",
            secret: WEBHOOK_SECRET,
          },
          events: [
            "issues",
            "pull_request",
            "issue_comment",
            "pull_request_review",
            "pull_request_review_comment",
            "label",
          ],
        });

        console.log(`[${this.formatTimestamp()}] ✅ Webhook created for ${owner}/${repo}`);
      } catch (error: any) {
        if (error.status === 403) {
          console.warn(
            `[${this.formatTimestamp()}] ⚠️  No permission to create webhook for ${repoUrl}. Falling back to polling.`,
          );
          this.pollingRepos.add(repoUrl);
        } else {
          console.error(
            `[${this.formatTimestamp()}] ❌ Error creating webhook for ${repoUrl}:`,
            error.message,
          );
        }
      }
    }

    this.webhookSetupComplete = true;
  }

  async start() {
    console.log(`[${this.formatTimestamp()}] Starting repository event monitor...`);
    console.log(`[${this.formatTimestamp()}] Loading cached state from SQLite...`);

    // Load cached state
    await this.loadStateFromCache();

    console.log(`[${this.formatTimestamp()}] Monitoring repos: ${REPOLIST.join(", ")}`);

    if (WEBHOOK_URL) {
      console.log(`[${this.formatTimestamp()}] Using webhooks for real-time notifications`);
      await this.setupWebhooks();

      // TODO: polling way

      // // Start polling for repos that couldn't set up webhooks
      if (this.pollingRepos.size > 0) {
        console.log(
          `[${this.formatTimestamp()}] Starting polling for ${this.pollingRepos.size} repos without webhook access`,
        );
        setInterval(() => {
          this.checkPollingRepos();
        }, this.pollInterval);

        // Initial check for polling repos
        await this.checkPollingRepos();
      }
    } else {
      console.log(`[${this.formatTimestamp()}] Using polling mode (30s interval)`);
      // Add all repos to polling when no webhooks available
      REPOLIST.forEach((repoUrl) => this.pollingRepos.add(repoUrl));
      setInterval(() => {
        this.checkPollingRepos();
      }, this.pollInterval);
      // Initial check
      await this.checkPollingRepos();
    }
  }

  private async checkPollingRepos() {
    sflow(this.pollingRepos).map((html_url) => {
      pageFlow(1, async (page, per_page = 100) => {
        const { data } = await ghc.issues.listForRepo({
          ...parseGithubRepoUrl(html_url),
          page,
          per_page,
        });
        return { data, next: data.length >= per_page ? page + 1 : null };
      }).flat();
    });
    // for (const repoUrl of this.pollingRepos) {
    //   try {
    //     await this.checkRepo(repoUrl);
    //   } catch (error) {
    //     console.error(`[${this.formatTimestamp()}] Error checking ${repoUrl}:`, error);
    //   }
    // }
  }

  // private async checkRepo(repoUrl: string) {
  //   const { owner, repo } = this.parseRepoUrl(repoUrl);
  //   const key = `${owner}/${repo}`;
  //   const state = this.monitorState.get(key)!;

  //   await Promise.all([this.checkIssues(owner, repo, state), this.checkPullRequests(owner, repo, state)]);

  //   state.lastCheckTime = new Date();

  //   // Save updated state to cache
  //   await this.saveStateToCache(key, state);
  // }

  // private async checkIssues(owner: string, repo: string, state: RepoMonitorState) {
  //   try {
  //     // Get recent issues
  //     const { data: issues } = await gh.issues.listForRepo({
  //       owner,
  //       repo,
  //       state: "all",
  //       sort: "updated",
  //       direction: "desc",
  //       per_page: 10,
  //       since: new Date(Date.now() - this.pollInterval * 2).toISOString(),
  //     });

  //     for (const issue of issues) {
  //       if (issue.pull_request) continue; // Skip PRs in issues endpoint

  //       // Check for new issue
  //       if (issue.id > state.lastIssueId) {
  //         console.log(`[${this.formatTimestamp()}] 🆕 NEW ISSUE: ${owner}/${repo}#${issue.number} - ${issue.title}`);
  //         state.lastIssueId = Math.max(state.lastIssueId, issue.id);
  //         await this.saveStateToCache(`${owner}/${repo}`, state);
  //       }

  //       // Check for new comments
  //       if (new Date(issue.updated_at) > state.lastCheckTime) {
  //         await this.checkIssueComments(owner, repo, issue.number);
  //       }

  //       // Check for label changes (by comparing updated time)
  //       if (new Date(issue.updated_at) > state.lastCheckTime) {
  //         await this.checkIssueLabels(owner, repo, issue.number, issue.labels);
  //       }
  //     }
  //   } catch (error) {
  //     console.error(`[${this.formatTimestamp()}] Error checking issues for ${owner}/${repo}:`, error);
  //   }
  // }

  // private async checkPullRequests(owner: string, repo: string, state: RepoMonitorState) {
  //   try {
  //     // Get recent PRs
  //     const { data: prs } = await gh.pulls.list({
  //       owner,
  //       repo,
  //       state: "all",
  //       sort: "updated",
  //       direction: "desc",
  //       per_page: 10,
  //     });

  //     for (const pr of prs) {
  //       // Check for new PR
  //       if (pr.id > state.lastPRId) {
  //         console.log(`[${this.formatTimestamp()}] 🔄 NEW PR: ${owner}/${repo}#${pr.number} - ${pr.title}`);
  //         state.lastPRId = Math.max(state.lastPRId, pr.id);
  //         await this.saveStateToCache(`${owner}/${repo}`, state);
  //       }

  //       // Check for new PR comments
  //       if (new Date(pr.updated_at) > state.lastCheckTime) {
  //         await this.checkPRComments(owner, repo, pr.number);
  //       }

  //       // Check for label changes
  //       if (new Date(pr.updated_at) > state.lastCheckTime) {
  //         await this.checkIssueLabels(owner, repo, pr.number, pr.labels);
  //       }
  //     }
  //   } catch (error) {
  //     console.error(`[${this.formatTimestamp()}] Error checking PRs for ${owner}/${repo}:`, error);
  //   }
  // }

  // private async checkIssueComments(owner: string, repo: string, issueNumber: number) {
  //   try {
  //     const { data: comments } = await gh.issues.listComments({
  //       owner,
  //       repo,
  //       issue_number: issueNumber,
  //       per_page: 5,
  //       since: new Date(Date.now() - this.pollInterval * 2).toISOString(),
  //     });

  //     for (const comment of comments) {
  //       if (new Date(comment.created_at) > new Date(Date.now() - this.pollInterval * 2)) {
  //         console.log(
  //           `[${this.formatTimestamp()}] 💬 NEW ISSUE COMMENT: ${owner}/${repo}#${issueNumber} by ${comment.user?.login}`,
  //         );
  //       }
  //     }
  //   } catch (error) {
  //     console.error(`[${this.formatTimestamp()}] Error checking issue comments:`, error);
  //   }
  // }

  // private async checkPRComments(owner: string, repo: string, prNumber: number) {
  //   try {
  //     // Check issue comments on PR
  //     const { data: issueComments } = await gh.issues.listComments({
  //       owner,
  //       repo,
  //       issue_number: prNumber,
  //       per_page: 5,
  //       since: new Date(Date.now() - this.pollInterval * 2).toISOString(),
  //     });

  //     for (const comment of issueComments) {
  //       if (new Date(comment.created_at) > new Date(Date.now() - this.pollInterval * 2)) {
  //         console.log(
  //           `[${this.formatTimestamp()}] 💬 NEW PR COMMENT: ${owner}/${repo}#${prNumber} by ${comment.user?.login}`,
  //         );
  //       }
  //     }

  //     // Check review comments
  //     const { data: reviewComments } = await gh.pulls.listReviewComments({
  //       owner,
  //       repo,
  //       pull_number: prNumber,
  //       per_page: 5,
  //       since: new Date(Date.now() - this.pollInterval * 2).toISOString(),
  //     });

  //     for (const comment of reviewComments) {
  //       if (new Date(comment.created_at) > new Date(Date.now() - this.pollInterval * 2)) {
  //         console.log(
  //           `[${this.formatTimestamp()}] 🔍 NEW PR REVIEW COMMENT: ${owner}/${repo}#${prNumber} by ${comment.user?.login}`,
  //         );
  //       }
  //     }
  //   } catch (error) {
  //     console.error(`[${this.formatTimestamp()}] Error checking PR comments:`, error);
  //   }
  // }

  // private async checkIssueLabels(owner: string, repo: string, issueNumber: number, labels: any[]) {
  //   // This is a simplified approach - in a real implementation, you'd want to store
  //   // previous label state to detect actual additions/removals
  //   if (labels && labels.length > 0) {
  //     const labelNames = labels.map((label) => (typeof label === "string" ? label : label.name)).join(", ");
  //     console.log(`[${this.formatTimestamp()}] 🏷️  LABELS ON ${owner}/${repo}#${issueNumber}: ${labelNames}`);
  //   }
  // }
}

if (import.meta.main) {
  // Start the monitoring system
  const monitor = new RepoEventMonitor();
  const server = Bun.serve({
    port: process.env.GITHUB_WEBHOOK_PORT || process.env.PORT || DIE("missing env.PORT"),
    routes: {
      "/api/github/webhook": (req) => monitor.webhookRequestHandler(req),
      "/": new Response(
        "Hello from Comfy-Org/Comfy-PR Github Service, contact snomiao@gmail.com if you have encountered any problem.",
      ),
      "/health": () => new Response("gh-service OK"),
    },
  });
  console.log(`Server listening on ${server.url}`);
  console.log(`Webhook endpoint: ${WEBHOOK_URL}`);
  await gh.users
    .getAuthenticated()
    .then((e) => e.data)
    .then((user) => {
      console.log(`[Github Service] Authenticated as ${user.login}`);
    });
  monitor.start();
}
