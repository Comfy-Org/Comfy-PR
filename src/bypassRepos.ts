import { z } from "zod";
import { yaml } from "./utils/yaml";

export const bypassRepos = z
  .string()
  .array()
  .parse(yaml.parse(await Bun.file("./bypass.yaml").text()).bypass_repos);
export const isRepoBypassed = (repo: string) => bypassRepos.some((reg) => repo.match(reg));
