import { mkdir } from "fs/promises";
import { $ } from "../../../src/cli/echoBunShell";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

export interface SpawnSubAgentOptions {
  repo: string; // format: "owner/repo"
  branch: string;
  prompt: string;
}

/**
 * Clone a repository to /repos/[owner]/[repo]/tree/[branch] if not already cloned,
 * then spawn a claude-yes agent in that directory with the given prompt.
 */
export async function spawnSubAgent(options: SpawnSubAgentOptions) {
  const { repo, branch, prompt } = options;

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

  // Construct the target directory path using absolute /repos
  const repoDir = path.join("/repos", owner, repoName, "tree", branch);

  // Check if the repository is already cloned
  if (!existsSync(repoDir)) {
    console.log(`Cloning ${repo} (branch: ${branch}) to ${repoDir}...`);

    // Create parent directory
    await mkdir(path.dirname(repoDir), { recursive: true });

    // Clone the repository using gh CLI with authentication
    // This uses the GH_TOKEN_COMFY_PR_BOT token automatically
    await $`GH_TOKEN=${ghToken} gh repo clone ${repo} ${repoDir} -- --single-branch --branch ${branch}`;

    console.log(`Successfully cloned ${repo}@${branch}`);
  } else {
    console.log(`Repository already exists at ${repoDir}`);

    // Optionally pull latest changes
    console.log("Pulling latest changes...");
    await $`cd ${repoDir} && GH_TOKEN=${ghToken} git pull origin ${branch}`;
  }

  // Spawn claude-yes agent in the repository directory
  console.log(`\nSpawning claude-yes agent in ${repoDir}...`);
  console.log(`Prompt: ${prompt}\n`);

  return new Promise<void>((resolve, reject) => {
    // Pass the GitHub token to the subagent via environment variables
    const env = {
      ...process.env,
      GH_TOKEN: ghToken,
      GH_TOKEN_COMFY_PR_BOT: ghToken,
    };

    const claudeProcess = spawn("claude-yes", ["-i=3min", "--prompt", prompt], {
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
