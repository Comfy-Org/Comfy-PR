#!/usr/bin/env bun
/*
bun index.ts
*/
import type { WithId } from "mongodb";
import "react-hook-form";
import { type CMNode } from "./CMNodes";
import { type CRNode } from "./CRNodes";
import { type SlackMsg } from "./SlackMsgs";
import { db } from "./db";
import { type RelatedPull } from "./fetchRelatedPulls";
import { type GithubPull } from "./fetchRepoPRs";
import { gh } from "./gh";
import { type Task } from "./utils/Task";

type Email = {
  from?: string;
  title: string;
  body: string;
  to: string;
};

type Sent = {
  slack?: SlackMsg;
  emails?: Email[];
};

type GithubIssueComment = Awaited<ReturnType<typeof gh.issues.getComment>>["data"];
type GithubIssue = Awaited<ReturnType<typeof gh.issues.get>>["data"];
type GithubRepo = Awaited<ReturnType<typeof gh.repos.get>>["data"];
export type CRType = "pyproject" | "publichcr";
export type CRPull = RelatedPull & {
  edited?: Task<boolean>;
  comments?: Task<GithubIssueComment[]>;
  issue?: Task<GithubIssue>;
};

export type CustomNodeRepo = {
  repository: string;
  cr?: WithId<CRNode>;
  cm?: WithId<CMNode>;
  info?: Task<GithubRepo>;
  pulls?: Task<GithubPull[]>;
  crPulls?: Task<CRPull[]>;
  candidate?: Task<boolean>;
  // createFork?: Task<GithubRepo>;
  // createBranches?: Task<{ type: CRType; assigned: Worker } & PushedBranch>[];
  createdPulls?: Task<GithubPull[]>;
};
export type CNRepo = CustomNodeRepo;
export const CNRepos = db.collection<CNRepo>("CNRepos");
await CNRepos.createIndex({ repository: 1 }, { unique: true });

// fix cr null, it should be not exists
await CNRepos.updateMany({ cr: null as unknown as WithId<CRNode> }, { $unset: { cr: 1 } });
