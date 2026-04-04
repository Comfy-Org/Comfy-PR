/** Interface for per-repo app bootstrap strategies. */

import type { ChildProcess } from "child_process";

export interface AppProcess {
  /** Running processes to clean up. */
  processes: ChildProcess[];
  /** The base URL the app is serving on. */
  baseUrl: string;
  /** Stop all processes. */
  cleanup: () => Promise<void>;
}

export interface AppBootstrap {
  /** Human-readable name. */
  name: string;
  /** Detect if this bootstrap applies to the given repo directory. */
  detect: (repoDir: string) => Promise<boolean>;
  /** Install dependencies. */
  install: (repoDir: string) => Promise<void>;
  /** Start the dev server and return a handle. */
  start: (repoDir: string) => Promise<AppProcess>;
  /** Check if the app is ready at the given URL. */
  readyCheck: (url: string) => Promise<boolean>;
  /** Default base URL. */
  defaultBaseUrl: string;
}
