import { z } from "zod";
import { yaml } from "./utils/yaml";

export const { ignore_repos } = z
  .object({
    ignore_repos: z.string().array(),
  })
  .parse(yaml.parse(await Bun.file("./comfypr-ignore.yaml").text()));
export const isRepoBypassed = (repo: string) => ignore_repos.some((reg) => repo.match(reg));
