import DIE from "@snomiao/die";
import { readFile } from "fs/promises";
import { GithubRepoPRss } from "./fetchRepoPRs";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";
import { slackLinksNotify } from "./slackUrlsNotify";
import { parsePRlink } from "./updateRepoPRStatus";
import pMap from "p-map";
import { YAML } from "zx";
if (import.meta.main) {
  // const repo = "https://github.com/ltdrdata/ComfyUI-Manager";
  const repo = 'https://github.com/WASasquatch/PPF_Noise_ComfyUI';
  await checkRepoPRStatus(repo);
  // await checkAllRepoPRStatus();
}
async function checkAllRepoPRStatus() {
  return await pMap(await GithubRepoPRss.find({}).toArray(), async (e) => {
    const { toml, action } = await checkRepoPRStatus(e.repo);
    if (!toml || !action) return [];
    return [{ repo: e.repo, toml, action }];
  });
}

export async function checkRepoPRStatus(repository: string) {
  const { prs } =
    (await GithubRepoPRss.findOne({ repo: repository })) ??
    DIE("Repo PR is not updated");

  const [addTomlTitle, addActionTitle] = [
    await readFile("./templates/" + "add-toml.md", "utf8"),
    await readFile("./templates/" + "add-action.md", "utf8"),
  ]
    .map(parseTitleBodyOfMarkdown)
    .map((e) => e.title);

  const tomlPRs = prs.filter((e) => e.title === addTomlTitle);
  const actionPRs = prs.filter((e) => e.title === addActionTitle);

  tomlPRs.length > 1 &&
    (await slackLinksNotify(
      "WARN: multiple pyproject.toml PR found",
      tomlPRs.map(parsePRlink)
    ));
  actionPRs.length > 1 &&
    (await slackLinksNotify(
      "WARN: multiple Publish Action PR found",
      actionPRs.map(parsePRlink)
    ));
  console.log(
    YAML.stringify({
      repository,
      tomlPRs: tomlPRs.length,
      actionPRs: actionPRs.length,
    })
  );
  const toml = tomlPRs.find(Boolean);
  const action = actionPRs.find(Boolean);
  return { toml, action };
}
