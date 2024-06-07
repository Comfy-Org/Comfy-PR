#!/usr/bin/env bun

import { $ as bunSh } from "bun";
import "dotenv/config";
import { writeFile, readFile, rm } from "fs/promises";
import md5 from "md5";
import { basename, dirname } from "path";
import yaml from "yaml";
import { argv, chalk, os, question, updateArgv, $ as zx } from "zx";
import DIE from "@snomiao/die";
import { $ } from "./echoBunShell";
import { gh } from "../scripts/gh";
import { F, fromPairs, groupBy } from "rambda";
import toml from "toml";

zx.verbose = true;

// read env/parameters
console.log("Fetch Current Github User...");
const user = (await gh.users.getAuthenticated()).data;
const GIT_USERNAME =
  process.env.GIT_USERNAME ||
  (user.email && user.name) ||
  (await question("Input env.GIT_USERNAME: ")) ||
  DIE("Missing env.GIT_USERNAME");
const GIT_USEREMAIL =
  process.env.GIT_USEREMAIL ||
  (user.email && user.email) ||
  (await question("Input env.GIT_USEREMAIL: ")) ||
  DIE("Missing env.GIT_USEREMAIL");
const FORK_OWNER =
  process.env.FORK_OWNER?.replace(/"/g, "")?.trim() ||
  user.name ||
  (await question(
    "Input env.FORK_OWNER (for example FORK_OWNER=ComfyNodePRs, will fork into https://github.com/ComfyNodePRs): "
  )) ||
  DIE("Missing env.FORK_OWNER");
const FORK_PREFIX =
  (process.env.FORK_PREFIX?.replace(/"/g, "")?.trim() ||
    (await question(
      "Input env.FORK_PREFIX ('PR-' is Recommened, but also it could be empty): "
    ))) ??
  DIE('Missing env.FORK_PREFIX, if you want empty maybe try FORK_PREFIX=""');

console.log(`GIT_USER: ${GIT_USERNAME} <${GIT_USEREMAIL}>`);

export async function checkComfyActivated() {
  console.log("Checking ComfyUI Activated...");
  const activate =
    os.platform() === "win32"
      ? ".venv\\Scripts\\activate"
      : "source .venv/bin/activate";
  if (!(await bunSh`comfy --help`.quiet().catch(() => null))) {
    DIE(
      `
Cound not found comfy-cli.
Please install comfy-cli before run "bunx comfy-pr" here.

$ >>>>>>>>>>>>>>>>>>>>>>>>>>
python -m venv .venv
${activate}
pip install comfy-cli
comfy-cli --help
`.trim()
    );
  }
}

export async function fetchNodeList() {
  const customNodeListSource =
    process.env.CUSTOM_LIST_SOURCE ||
    "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/custom-node-list.json";
  const nodeList = (await fetch(customNodeListSource).then((e) =>
    e.json()
  )) as {
    custom_nodes: {
      author: "Dr.Lt.Data" | string;
      title: "ComfyUI-Manager" | string;
      id: "manager" | string;
      reference: "https://github.com/ltdrdata/ComfyUI-Manager" | string;
      files: ["https://github.com/ltdrdata/ComfyUI-Manager"] | string[];
      install_type: "git-clone" | string;
      description: "ComfyUI-Manager itself is also a custom node." | string;
    }[];
  };
  return nodeList;
}
async function fetchRepoDescriptionMap() {
  const nodeList = await fetchNodeList();
  const custom_nodes = nodeList.custom_nodes;
  const repoDescriptionMap = fromPairs(
    nodeList.custom_nodes.map((e) => [e.reference, e.description])
  );
  repoDescriptionMap["https://github.com/snomiao/ComfyNode-Registry-test"] =
    "ComfyNode-Registry-test-description";

  console.log("Fetched " + custom_nodes.length + " CustomNode descriptions");
  return repoDescriptionMap;
}

export async function ComfyRegistryPR(upstreamUrl: string) {
  // Repo Define
  const upstream = parseOwnerRepo(upstreamUrl);
  const salt = argv.salt || process.env.SALT || "m3KMgZ2AeZGWYh7W";
  console.log(`* Change env.SALT=${salt} will fork into a different repo`);
  const repo_hash = md5(
    `${salt}-${user.name}-${upstream.owner}/${upstream.repo}`
  ).slice(0, 8);
  const forkRepoName =
    (FORK_PREFIX && `${FORK_PREFIX}${upstream.repo}-${repo_hash}`) ||
    upstream.repo;
  const forkDst = `${FORK_OWNER}/${forkRepoName}`;
  const forkSSHUrl = `git@github.com:${forkDst}`;
  const forkHTTPSUrl = `https://github.com/${forkDst}`;
  const src = parseOwnerRepo(forkSSHUrl);
  // console.log("PR_SRC: ", forkSSHUrl);
  // console.log("PR_DST: ", upstreamUrl);
  // console.log(forkSSHUrl);
  console.log("Cleaning the pr before run");
  const dir = `prs/${src.repo}`;
  await rm(dir, { recursive: true }).catch(() => null);

  //   const choose = await question(
  //     `
  // Prepare to fork...
  // From: ${upstreamUrl}
  //   To: ${forkHTTPSUrl}
  // Are you ready to fork (y/N)?
  // `.trim()
  //   );
  //   choose.match(/y/i) || DIE("User Aborted");
  //   FORK
  await fork(upstream, src);

  // prInfos
  const PR_REQUESTS = (
    await Promise.all([
      add_publish(dir, upstreamUrl, forkSSHUrl),
      add_pyproject(dir, upstreamUrl, forkSSHUrl),
    ])
  ).map((content) => ({ ...content, src, dst: upstream }));

  console.log("PR Infos");
  console.log(chalk.green(yaml.stringify({ PR_REQUESTS })));
  // prs
  await Promise.all(PR_REQUESTS.map((prInfo) => pr({ ...prInfo })));

  console.log("ALL DONE");
}

async function pr({
  title,
  body,
  branch,
  src,
  dst,
}: {
  title: string;
  body: string;
  branch: string;
  src: { owner: string; repo: string };
  dst: { owner: string; repo: string };
}) {
  const repo = (await gh.repos.get({ ...dst })).data;

  // TODO: seems has bugs on head_repo
  const existedList = (
    await gh.pulls.list({
      // source repo
      state: "all",
      head_repo: src.owner + "/" + src.repo,
      head: src.owner + ":" + branch,
      // pr will merge into
      owner: dst.owner,
      repo: dst.repo,
      base: repo.default_branch,
    })
  ).data;
  if (existedList.length) {
    const msg = {
      PR_Existed: existedList.map((e) => ({ url: e.html_url, title: e.title })),
    };
    console.log(chalk.red(yaml.stringify(msg)));
    return;
  }

  const pr_result = await gh.pulls
    .create({
      // pr info
      title,
      body,
      // source repo
      head_repo: src.owner + "/" + src.repo,
      head: src.owner + ":" + branch,
      // pr will merge into
      owner: dst.owner,
      repo: dst.repo,
      base: repo.default_branch,
      maintainer_can_modify: true,
      // draft: true,
    })
    .catch(async (e) => {
      if (e.message.match("A pull request already exists for")) {
        console.log("PR Existed ", e);
        // WARN: will search all prs
        const existedList = (
          await gh.pulls.list({
            // source repo
            state: "open",
            head_repo: src.owner + "/" + src.repo,
            // head: src.owner + ":" + branch,
            // pr will merge into
            owner: dst.owner,
            repo: dst.repo,
            base: repo.default_branch,
          })
        ).data;
        if (existedList.length) {
          const msg = {
            PR_Existed: existedList.map((e) => ({
              url: e.html_url,
              title: e.title,
            })),
          };
          console.log(chalk.red(yaml.stringify(msg)));
          return;
        }

        return null;
      }
      throw e;
    });
  console.log("PR OK", pr_result?.data.html_url);
}

async function add_pyproject(
  dir: string,
  upstreamUrl: string,
  forkUrl: string
) {
  const branch = "pyproject";
  const tmpl = await readFile("./templates/add-toml.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseOwnerRepo(forkUrl);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    console.log("Skip changes as branch existed: " + branch);
    return { title, body, branch };
  }

  const src = parseOwnerRepo(upstreamUrl);
  const cwd = `${dir}/${branch}/${src.repo}`; // src.repo is for keep correct directory name
  // commit changes
  await $`
git clone ${upstreamUrl} ${cwd}

cd ${cwd}
echo N | comfy node init
`;

  // Try fill description from ComfyUI-manager
  const referenceUrl = `https://github.com/${src.owner}/${src.repo}`;
  const pyprojectToml = cwd + "/pyproject.toml";
  await fillDescription(referenceUrl, pyprojectToml).catch((e) => {
    console.error(e);
  });

  await $`
cd ${cwd}
git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add . && \
git commit -am ${`chore(${branch}): ${title}`} && \
git push "${forkUrl}" ${branch}:${branch}
`;
  const branchUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { title, body, branch };
}

async function fillDescription(referenceUrl: string, pyprojectToml: string) {
  const repoDescriptionMap = await fetchRepoDescriptionMap();
  const matchedDescription =
    repoDescriptionMap[referenceUrl]?.toString() ||
    DIE("Warn: missing description for " + referenceUrl);
  const replaced = (await readFile(pyprojectToml, "utf8")).replace(
    `description = ""`,
    `description = ${JSON.stringify(matchedDescription)}`
  );
  // check validity
  toml.parse(replaced);
  await writeFile(pyprojectToml, replaced);
}

async function add_publish(dir: string, upstreamUrl: string, forkUrl: string) {
  const branch = "publish";
  const tmpl = await readFile("./templates/add-action.md", "utf8");
  const { title, body } = parseTitleBodyOfMarkdown(tmpl);
  const repo = parseOwnerRepo(forkUrl);

  if (await gh.repos.getBranch({ ...repo, branch }).catch(() => null)) {
    console.log("Skip changes as branch existed: " + branch);
    return { title, body, branch };
  }

  const src = parseOwnerRepo(upstreamUrl);
  const cwd = `${dir}/${branch}/${src.repo}`; // src.repo is for keep correct directory name

  const file = `${cwd}/.github/workflows/publish.yml`;
  const publishYmlPath = "./templates/publish.yaml";

  // commit & push changes
  await $`
git clone ${upstreamUrl} ${cwd}

mkdir -p ${dirname(file)}
cat ${publishYmlPath} > ${file}

cd ${cwd}

git config user.name ${GIT_USERNAME} && \
git config user.email ${GIT_USEREMAIL} && \
git checkout -b ${branch} && \
git add . && \ 
git commit -am "chore(${branch}): ${title}" && \
git push "${forkUrl}" ${branch}:${branch}
    `;

  const branchUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${branch}`;
  console.log(`Branch Push OK: ${branchUrl}`);
  return { title, body, branch };
}

async function fork(
  from: { owner: string; repo: string },
  to: { owner: string; repo: string }
) {
  const forkResult = await gh.repos
    .createFork({
      ...(user.name !== to.owner && { organization: to.owner }),
      name: to.repo,
      owner: from.owner,
      repo: from.repo,
    })
    .catch((e) => {
      if (e.message.match("Name already exists on this account")) return null;
      throw e;
    });
  const forkedUrl =
    forkResult?.data.html_url ??
    "https://github.com/" + to.owner + "/" + to.repo;
  console.log("FORK OK ", forkedUrl);
}

function parseOwnerRepo(name: string) {
  return {
    owner: basename(dirname(name.replace(/:/, "/"))),
    repo: basename(name.replace(/:/, "/")),
  };
}

function parseTitleBodyOfMarkdown(tmpl: string) {
  const title = tmpl.split("\n")[0].slice(1).trim();
  const body = tmpl.split("\n").slice(1).join("\n").trim();
  return { title, body };
}
