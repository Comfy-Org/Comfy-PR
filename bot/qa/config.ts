/** Default configuration for QA Bot runs. */

export const QA_CONFIG = {
  /** Video recording settings. */
  video: {
    width: 1920,
    height: 1080,
    fps: 30,
    format: "webm" as const,
    maxDurationMs: 5 * 60 * 1000,
    maxFileSizeBytes: 50 * 1024 * 1024,
  },

  /** Timeout settings (ms). */
  timeouts: {
    appBoot: 120_000,
    testRun: 300_000,
    totalRun: 600_000,
    readyCheck: 60_000,
    readyPollInterval: 2_000,
  },

  /** Agent settings. */
  agent: {
    model: "claude-sonnet-4-20250514",
    maxIterations: 30,
    testRetries: 2,
  },

  /** Paths. */
  paths: {
    qaRunsDir: "/bot/qa-runs",
  },

  /** Artifact storage. */
  artifacts: {
    ttlDays: 14,
    maxSizeBytes: 100 * 1024 * 1024,
  },
} as const;
