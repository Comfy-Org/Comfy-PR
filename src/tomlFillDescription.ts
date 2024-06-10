import { writeFile, readFile } from "fs/promises";
import DIE from "@snomiao/die";
import toml from "toml";
import { fetchRepoDescriptionMap } from "./fetchRepoDescriptionMap";

export async function tomlFillDescription(referenceUrl: string, pyprojectToml: string) {
  const repoDescriptionMap = await fetchRepoDescriptionMap();
  const matchedDescription = repoDescriptionMap[referenceUrl]?.toString() ||
    DIE("Warn: missing description for " + referenceUrl);
  const replaced = (await readFile(pyprojectToml, "utf8")).replace(
    `description = ""`,
    `description = ${JSON.stringify(matchedDescription)}`
  );
  // check validity
  toml.parse(replaced);
  await writeFile(pyprojectToml, replaced);
}
