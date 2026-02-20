#!/usr/bin/env bun
/*
bun index.ts
*/
import type { ObjectId, WithId } from "mongodb";
import "react-hook-form";
import { type Task } from "../packages/mongodb-pipeline-ts/Task";
import { type CMNode } from "./CMNodes";
import { type CRNode } from "./CRNodes";
import { db } from "./db";
import { gh } from "@/lib/github";
import { type RelatedPull } from "./matchRelatedPulls";
import type { GithubPullParsed } from "./parsePullsState";
import { type SlackMsg } from "@/lib/slack/SlackMsgs";

type Email = {
  from?: string;
  title: string;
  body: string;
  to: string;
};

type _Sent = {
  slack?: SlackMsg;
  emails?: Email[];
};

// TODO: refactor into interface to improve performance
type GithubIssueComment = Awaited<ReturnType<typeof gh.issues.getComment>>["data"];
type GithubIssue = Awaited<ReturnType<typeof gh.issues.get>>["data"];
type GithubRepo = Awaited<ReturnType<typeof gh.repos.get>>["data"];
export type CRType = "pyproject" | "publichcr";
export type CRPull = RelatedPull & {
  edited?: Task<boolean>;
  comments?: Task<Pick<GithubIssueComment, "body">[]>;
  issue?: Task<Pick<GithubIssue, "number" | "html_url" | "body" | "updated_at">>;
  emailTask_id?: ObjectId;
};
// TODO: refactor into interface to improve performance
export type CustomNodeRepo = {
  // github url
  repository: string;

  info?: Task<Pick<GithubRepo, "html_url" | "archived" | "default_branch" | "private">>;

  // author?: Author;

  /** @deprecated use cr_ids or on_registry */
  cr?: Pick<WithId<CRNode>, "_id" | "id" | "name">;

  cr_ids?: ObjectId[];

  on_registry?: Task<boolean>; // check if cr_ids is not empty, exclude publisher.id === ADMIN
  on_registry_all?: Task<boolean>; // check if cr_ids is not empty, including  publisher.id === ADMIN

  /** @deprecated use cm_ids */
  cm?: Pick<WithId<CMNode>, "_id" | "id" | "title">;
  cm_ids?: ObjectId[];

  // cache
  pulls?: Task<GithubPullParsed[]>;

  crPulls?: Task<CRPull[]>;

  /** @deprecated TODO: NOT IMPLEMENTD */
  crPull_ids: ObjectId[];

  candidate?: Task<boolean>;
  // createFork?: Task<GithubRepo>;
  // createBranches?: Task<{ type: CRType; assigned: Worker } & PushedBranch>[];

  /** TODO: @deprecated use CRPulls.pull */
  createdPulls?: Task<GithubPullParsed[]>;
};
export type CNRepo = CustomNodeRepo;
export const CNRepos = db.collection<CNRepo>("CNRepos");

CNRepos.createIndex({ repository: 1 }, { unique: true }).catch(() => {});

// Performance optimization: compound index for complex state + mtime queries
// This index improves queries filtering by multiple state and mtime fields
// Target query: aggregate with $match on crPulls.state, info.state, and various mtime fields
CNRepos.createIndex(
  {
    "crPulls.state": 1,
    "info.state": 1,
    "crPulls.mtime": 1,
    "info.mtime": 1,
    "candidate.mtime": 1,
  },
  {
    name: "idx_states_mtimes",
    background: true,
  },
).catch(() => {});

// Note: pulls.mtime index is created by setup-performance-indexes.ts script
// Run: bun run db:setup-indexes

// fix cr null, it should be not exists
// await CNRepos.updateMany({ cr: null as unknown as WithId<CRNode> }, { $unset: { cr: 1 } });
