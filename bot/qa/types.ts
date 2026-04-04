/** Shared types for the QA Bot system. */

export type QAType = "reproduce" | "verify" | "smoke" | "demo" | "run";

export type Verdict =
  | "REPRODUCED"
  | "NOT_REPRODUCIBLE"
  | "VERIFIED"
  | "REGRESSION"
  | "INCONCLUSIVE"
  | "DEMO_COMPLETE";

export type ReproducedBy = "e2e_test" | "video" | "both" | "none";

export interface QATask {
  /** Unique run identifier. */
  runId: string;
  type: QAType;
  repo: string; // "owner/repo"
  branch: string;
  commit?: string;

  /** For reproduce tasks — the GitHub issue. */
  issueNumber?: number;
  issueTitle?: string;
  issueBody?: string;

  /** For verify tasks — the PR. */
  prNumber?: number;
  prTitle?: string;
  prBody?: string;
  baseBranch?: string;

  /** Free-form prompt for demo/run tasks. */
  prompt?: string;

  /** Where to post results. */
  postGitHub?: boolean;
  postSlackChannel?: string;
  postSlackThread?: string;
}

export interface VideoArtifact {
  path: string;
  name: string;
  sizeBytes: number;
  durationSeconds?: number;
  url?: string; // after upload
}

export interface ScreenshotArtifact {
  path: string;
  name: string;
  timestamp: number; // ms since start
}

export interface QAEvidence {
  videos: VideoArtifact[];
  screenshots: ScreenshotArtifact[];
  testCode?: string;
  consoleErrors: string[];
  networkErrors: string[];
}

export interface QAResult {
  task: QATask;
  verdict: Verdict;
  summary: string;
  details: string;
  reproducedBy: ReproducedBy;
  evidence: QAEvidence;
  durationMs: number;
  artifactsDir: string;
}
