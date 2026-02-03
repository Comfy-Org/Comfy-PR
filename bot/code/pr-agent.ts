import { mkdir } from "fs/promises";
import { $ } from "../../src/cli/echoBunShell";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

/**
 * Check if a remote branch exists in a GitHub repository
 */
async function checkRemoteBranchExists(
  repo: string,
  branch: string,
  token: string,
): Promise<boolean> {
  try {
    await $`GH_TOKEN=${token} gh api repos/${repo}/branches/${branch} --silent`;
    return true;
  } catch {
    return false;
  }
}

export interface SpawnSubAgentOptions {
  repo: string; // format: "owner/repo"
  base: string; // base branch to merge into (e.g., "main", "develop")
  head: string; // head branch to develop on (e.g., "feature/fix-auth")
  prompt: string;
}

/**
 * Clone a repository to /repos/[owner]/[repo]/tree/[head] if not already cloned,
 * then spawn a claude-yes agent in that directory with the given prompt.
 * The agent will work on the head branch, which can be merged into the base branch.
 */
export async function spawnSubAgent(options: SpawnSubAgentOptions) {
  const { repo, base, head, prompt } = options;

  // Parse owner and repo name
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid repo format: ${repo}. Expected format: owner/repo`);
  }

  // Get the GitHub token for the PR bot
  const ghToken = process.env.GH_TOKEN_COMFY_PR_BOT || process.env.GH_TOKEN;
  if (!ghToken) {
    throw new Error("Missing GH_TOKEN_COMFY_PR_BOT or GH_TOKEN environment variable");
  }

  // Construct the target directory path using absolute /bot/prs/
  const repoDir = path.join("/bot/prs/", owner, repoName, "tree", head);

  // Check if the repository is already cloned
  if (!existsSync(repoDir)) {
    console.log(`Cloning ${repo} (base: ${base}, head: ${head}) to ${repoDir}...`);

    // Create parent directory
    await mkdir(path.dirname(repoDir), { recursive: true });

    // Clone the repository with base branch first, then create/checkout head branch
    const baseBranchExists = await checkRemoteBranchExists(repo, base, ghToken);
    if (!baseBranchExists) {
      throw new Error(`Base branch '${base}' does not exist in ${repo}`);
    }

    // Clone with base branch
    await $`GH_TOKEN=${ghToken} gh repo clone ${repo} ${repoDir} -- --single-branch --branch ${base}`;

    // Check if head branch exists remotely
    const headBranchExists = await checkRemoteBranchExists(repo, head, ghToken);

    if (headBranchExists) {
      // Head branch exists, checkout
      console.log(`Head branch '${head}' exists, checking it out...`);
      await $`cd ${repoDir} && git fetch origin ${head} && git checkout ${head}`;
    } else {
      // Create new head branch from base
      console.log(`Creating new head branch '${head}' from '${base}'...`);
      await $`cd ${repoDir} && git checkout -b ${head}`;
    }

    console.log(`Successfully prepared ${repo} (base: ${base}, head: ${head})`);
  } else {
    console.log(`Repository already exists at ${repoDir}`);

    // Pull latest changes from head branch if it exists, otherwise from base
    console.log("Pulling latest changes...");
    try {
      await $`cd ${repoDir} && GH_TOKEN=${ghToken} git pull origin ${head}`;
    } catch {
      console.log(`Head branch '${head}' not found remotely, pulling from base '${base}'...`);
      await $`cd ${repoDir} && GH_TOKEN=${ghToken} git pull origin ${base}`;
    }
  }

  // Spawn claude-yes agent in the repository directory
  console.log(`\nSpawning claude-yes agent in ${repoDir}...`);
  console.log(`Base branch: ${base}`);
  console.log(`Head branch: ${head}`);
  console.log(`Prompt: ${prompt}\n`);

  // Enhance the prompt with branch context
  const enhancedPrompt = `${prompt}

IMPORTANT: You are working on branch '${head}' which will make a draft PR into '${base}'.
- Make your changes on the '${head}' branch
- When you're done, create a draft pull request to merge '${head}' into '${base}'
- DON'T STOP UNTIL YOU HAVE COMPLETED THE TASK IN FULL AND A PULL REQUEST IS CREATED
`;

  return new Promise<void>((resolve, reject) => {
    // Pass the GitHub token to the subagent via environment variables
    const env = {
      ...process.env,
      GH_TOKEN: ghToken,
      GH_TOKEN_COMFY_PR_BOT: ghToken,
    };

    const claudeProcess = spawn("claude-yes", ["-i=3min", "--prompt", enhancedPrompt], {
      cwd: repoDir,
      stdio: "inherit", // Pass through stdin/stdout/stderr to parent process
      env, // Pass environment variables including the GitHub token
    });

    claudeProcess.on("error", (error) => {
      reject(new Error(`Failed to spawn claude-yes: ${error.message}`));
    });

    claudeProcess.on("close", (code) => {
      if (code === 0) {
        console.log("\nAgent session completed successfully");
        resolve();
      } else {
        reject(new Error(`Agent exited with code ${code}`));
      }
    });

    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      console.log("\nTerminating agent...");
      claudeProcess.kill("SIGINT");
    });
  });
}
