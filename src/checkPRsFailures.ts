import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { csvFormatBody } from "d3";
import sflow from "sflow";
import { CNRepos } from "./CNRepos";

if (import.meta.main) {
  const pipeline = $pipeline(CNRepos)
    .match({ "createdPulls.state": "error" })
    .set({ error: "$createdPulls.error" })
    .project({ _id: 0, repository: 1, error: 1 })
    .as<{ repository: string; error: string }>()
    .aggregate();
  const csv = await sflow(pipeline)
    .map((e, i) => ((!i && "repository,error\n") || "") + csvFormatBody([e]) + "\n")
    .log()
    .text();
  await Bun.write(".cache/pr-errors.csv", csv);
}
