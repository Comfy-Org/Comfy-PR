import { readFile, writeFile } from "fs/promises";
import yaml from "yaml";
if (import.meta.main) {
  
    const zodRule = z.object({

    }).array()
  const rules = zodRule.parse(yaml.parse(await readFile("default-rule.yaml", "utf8")))
}
