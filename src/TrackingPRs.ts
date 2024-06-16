import YAML from "yaml"
import { CNRepos } from "./CNRepos";
import { db } from "./db";
import { csvFormat } from "d3";

// 2) tracking the statuses of the PRs we've sent out (edited)
// "status [open, closed, merged]",
// "comments [int]",
// "last active [date]",
// "last updated [date]",

export const TrackingPulls = db.collection("TrackingPulls");
// bun --env-file .env.production.local src/dump.ts > dump.log
if (import.meta.main) {

  
}
