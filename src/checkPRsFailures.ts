import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import sflow from "sflow";
import { CNRepos } from "./CNRepos";
import { yaml } from "./utils/yaml";

if (import.meta.main) {
  const pipeline = $pipeline(CNRepos)
    .match({ "createdPulls.state": "error" })
    .set({ error: "$createdPulls.error" })
    .set({ mtime: "$createdPulls.mtime" })
    .project({ _id: 0, repository: 1, error: 1, mtime: 1 })
    .as<{ repository: string; error: string; mtime: Date }>()
    .aggregate();
  // const csv = await sflow(pipeline)
  //   .map((e, i) => ((!i && "repository,error\n") || "") + csvFormatBody([e]) + "\n")
  //   .log()
  //   .text();
  // await Bun.write(".cache/pr-errors.csv", csv);
  // await Bun.$`code .cache/pr-errors.csv`
  const yml = yaml.stringify(await sflow(pipeline).toArray());
  await Bun.write(".cache/pr-errors.yml", yml);
  await Bun.$`code .cache/pr-errors.yml`;
}
