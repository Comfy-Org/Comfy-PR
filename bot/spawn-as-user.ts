/**
 * Spawn Claude Code CLI as a specific Linux user via sudo.
 *
 * Used with the Claude Agent SDK's `spawnClaudeCodeProcess` option
 * to run agent subprocesses as per-task non-root users.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";

/**
 * Create a spawnClaudeCodeProcess function that runs the CLI as a specific Linux user.
 *
 * The SDK passes: { command, args, cwd, env, signal }
 * We wrap this in: sudo -n -u <username> <command> <args...>
 */
export function createUserSpawner(
  username: string,
  taskHome: string,
): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions): SpawnedProcess => {
    const { command, args, cwd, env, signal } = options;

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...env,
      HOME: taskHome,
      USER: username,
      LOGNAME: username,
    };
    // Ensure PATH includes bun/node/claude locations
    childEnv.PATH = `/root/.bun/bin:/root/.local/bin:/root/.nvm/versions/node/v25.2.1/bin:${childEnv.PATH || "/usr/local/bin:/usr/bin:/bin"}`;

    // Resolve command to full path (sudo resets PATH)
    const resolvedCommand =
      command === "bun"
        ? "/root/.bun/bin/bun"
        : command === "node"
          ? "/root/.nvm/versions/node/v25.2.1/bin/node"
          : command === "claude"
            ? "/root/.local/bin/claude"
            : command;

    // Use sudo to run as the task user
    const sudoArgs = ["-n", "-u", username, "--preserve-env", resolvedCommand, ...args];

    const proc = spawn("sudo", sudoArgs, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    }) as unknown as ChildProcessWithoutNullStreams;

    // Wire up abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    return {
      stdin: proc.stdin,
      stdout: proc.stdout,
      get killed() {
        return proc.killed;
      },
      get exitCode() {
        return proc.exitCode;
      },
      kill(signal: NodeJS.Signals) {
        return proc.kill(signal);
      },
      on(event, listener) {
        proc.on(event, listener as never);
      },
      once(event, listener) {
        proc.once(event, listener as never);
      },
      off(event, listener) {
        proc.off(event, listener as never);
      },
    };
  };
}
