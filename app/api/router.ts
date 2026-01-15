import pkg from "@/package.json";
import { CNRepos } from "@/src/CNRepos";
import { getWorkerInstance } from "@/src/WorkerInstances";
import { analyzePullsStatus } from "@/src/analyzePullsStatus";
import DIE from "@snomiao/die";
import { initTRPC } from "@trpc/server";
import sflow from "sflow";
import type { OpenApiMeta } from "trpc-to-openapi";
import z from "zod/v3";
import { GithubDesignTaskMeta } from "../tasks/gh-design/gh-design";
import { GithubContributorAnalyzeTask } from "../tasks/github-contributor-analyze/GithubContributorAnalyzeTask";

export const t = initTRPC.meta<OpenApiMeta>().create(); /* 👈 */
export const router = t.router({
  sayHello: t.procedure
    .meta({ openapi: { method: "GET", path: "/say-hello", description: "say hello" } })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => ({ greeting: `Hello ${input.name} 1!` })),
  version: t.procedure
    .meta({ openapi: { method: "GET", path: "/version", description: "Get version of ComfyPR" } })
    .input(z.object({}))
    .output(z.object({ version: z.string() }))
    .query(({}) => ({ version: pkg.version })),
  dumpCsv: t.procedure
    .meta({ openapi: { method: "GET", path: "/dump.csv", description: "Get csv dump" } })
    .input(z.object({}))
    .output(z.string())
    .query(() => DIE("Should impl in nextjs route.")),
  dumpYaml: t.procedure
    .meta({ openapi: { method: "GET", path: "/dump.yaml", description: "Get yaml dump" } })
    .input(z.object({}))
    .output(z.string())
    .query(() => DIE("Should impl in nextjs route.")),
  getWorker: t.procedure
    .meta({ openapi: { method: "GET", path: "/worker", description: "Get current worker" } })
    .input(z.object({}))
    .output(z.any())
    .query(async () => await getWorkerInstance()),
  analyzePullsStatus: t.procedure
    .meta({
      openapi: { method: "GET", path: "/analyze-pulls-status", description: "Get current worker" },
    })
    .input(z.object({ skip: z.number(), limit: z.number() }).partial())
    .output(
      z.object({
        updated: z.string(), // deprecated
        pull_updated: z.string(),
        repo_updated: z.string(),
        on_registry: z.boolean(),
        state: z.enum(["OPEN", "MERGED", "CLOSED"]),
        url: z.string(),
        head: z.string(),
        comments: z.number(),
        lastcomment: z.string(),
        ownername: z.string().optional(),
        repository: z.string().optional(),
        author_email: z.string().optional(),
      }),
    )
    .query(
      async ({ input: { limit = 0, skip = 0 } }) =>
        (await analyzePullsStatus({ limit, skip })) as any,
    ),
  getRepoUrls: t.procedure
    .meta({ openapi: { method: "GET", path: "/repo-urls", description: "Get repo urls" } })
    .input(z.object({}))
    .output(z.array(z.string()))
    .query(
      async () =>
        await sflow(CNRepos.find({}, { projection: { repository: 1 } }))
          .map((e) => (e as unknown as { repository: string }).repository)
          .filter((repo) => typeof repo === "string" && repo.length > 0)
          .toArray(),
    ),
  GithubContributorAnalyzeTask: t.procedure
    .meta({
      openapi: {
        method: "GET",
        path: "/github-contributor-analyze-task",
        description: "Get github contributor analyze task",
      },
    })
    .input(z.object({}))
    .output(
      z.array(
        z.object({
          repoUrl: z.string(),
          contributors: z
            .array(
              z.object({
                count: z.number(),
                name: z.string(),
                email: z.string(),
              }),
            )
            .optional(),
          updatedAt: z.date().optional(),
          error: z.string().optional(),
          errorAt: z.date().optional(),
        }),
      ),
    )
    .query(async () => await GithubContributorAnalyzeTask.find({}).toArray()),

  githubContributorAnalyze: t.procedure
    .meta({
      openapi: {
        method: "GET",
        path: "/github-contributor-analyze",
        description: "Get github contributor analyze",
      },
    })
    .input(z.object({ url: z.string() }))
    .output(
      z.object({
        repoUrl: z.string(),
        contributors: z.array(
          z.object({
            count: z.number(),
            name: z.string(),
            email: z.string(),
          }),
        ),
        updatedAt: z.date(),
      }),
    )
    .query(async ({ input: { url } }) => {
      // await import { githubContributorAnalyze } from "../tasks/github-contributor-analyze/githubContributorAnalyze";
      const { githubContributorAnalyze } =
        await import("../tasks/github-contributor-analyze/githubContributorAnalyze");
      const result = await githubContributorAnalyze(url);
      return result;
    }),

  getGithubDesignTaskMeta: t.procedure
    .meta({
      openapi: {
        method: "GET",
        path: "/tasks/gh-design/meta",
        description: "Get github design task metadata",
      },
    })
    .input(z.object({}))
    .output(
      z.object({
        meta: z
          .object({
            name: z.string().optional(),
            description: z.string().optional(),
            slackChannelName: z.string().optional(),
            slackMessageTemplate: z.string().optional(),
            repoUrls: z.array(z.string()).optional(),
            requestReviewers: z.array(z.string()).optional(),
            matchLabels: z.string().optional(),
            slackChannelId: z.string().optional(),
            lastRunAt: z.date().optional(),
            lastStatus: z.enum(["success", "error", "running"]).optional(),
            lastError: z.string().optional(),
          })
          .nullable(),
      }),
    )
    .query(async () => {
      try {
        const meta = await GithubDesignTaskMeta.findOne({ coll: "GithubDesignTask" });
        return { meta };
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
        throw new Error("Failed to fetch metadata");
      }
    }),

  updateGithubDesignTaskMeta: t.procedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/tasks/gh-design/meta",
        description: "Update github design task metadata",
      },
    })
    .input(
      z.object({
        slackMessageTemplate: z
          .string()
          .min(1, "Slack message template cannot be empty")
          .refine(
            (template) => template.includes("{{ITEM_TYPE}}"),
            "Slack message template must include {{ITEM_TYPE}} placeholder",
          )
          .refine(
            (template) => template.includes("{{URL}}"),
            "Slack message template must include {{URL}} placeholder",
          )
          .refine(
            (template) => template.includes("{{TITLE}}"),
            "Slack message template must include {{TITLE}} placeholder",
          )
          .optional(),
        requestReviewers: z
          .array(z.string().min(1, "Reviewer username cannot be empty"))
          .optional(),
        repoUrls: z
          .array(
            z
              .string()
              .url("Repository URL must be a valid URL")
              .refine(
                (url) => url.startsWith("https://github.com"),
                "Repository URL must start with https://github.com",
              ),
          )
          .optional(),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
        meta: z
          .object({
            name: z.string().optional(),
            description: z.string().optional(),
            slackChannelName: z.string().optional(),
            slackMessageTemplate: z.string().optional(),
            repoUrls: z.array(z.string()).optional(),
            requestReviewers: z.array(z.string()).optional(),
            matchLabels: z.string().optional(),
            slackChannelId: z.string().optional(),
            lastRunAt: z.date().optional(),
            lastStatus: z.enum(["success", "error", "running"]).optional(),
            lastError: z.string().optional(),
          })
          .nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      throw new Error(
        "Meta editing functionality is temporarily disabled. This feature is under maintenance.",
      );
      // TODO: add back later
      try {
        const updateData: any = {};
        if (input.slackMessageTemplate !== undefined)
          updateData.slackMessageTemplate = input.slackMessageTemplate;
        if (input.requestReviewers !== undefined)
          updateData.requestReviewers = input.requestReviewers;
        if (input.repoUrls !== undefined) updateData.repoUrls = input.repoUrls;

        const meta = await GithubDesignTaskMeta.$upsert(updateData);
        return { success: true, meta };
      } catch (error) {
        console.error("Failed to update metadata:", error);
        throw new Error("Failed to update metadata");
      }
    }),
});

export type AppRouter = typeof router;
