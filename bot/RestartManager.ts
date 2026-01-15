import { watch, type FSWatcher } from "fs";
import { resolve } from "path";

/**
 * RestartManager watches for file changes and queues a restart
 * that only executes when the bot is idle (no active tasks).
 *
 * @example
 * const restartManager = new RestartManager({
 *   watchPaths: ['bot/**\/*.ts', 'src/**\/*.ts'],
 *   isIdle: () => TaskInputFlows.size === 0,
 *   onRestart: () => process.exit(0),
 *   idleCheckInterval: 5000,
 *   debounceDelay: 1000
 * });
 * restartManager.start();
 */
export class RestartManager {
  private restartPending = false;
  private watchers: FSWatcher[] = [];
  private debounceTimer: Timer | null = null;
  private idleCheckTimer: Timer | null = null;

  constructor(
    private options: {
      /** Paths to watch for changes (can use glob patterns with Bun) */
      watchPaths: string[];
      /** Function that returns true when the bot is idle */
      isIdle: () => boolean;
      /** Callback to execute the restart (typically process.exit(0)) */
      onRestart: () => void;
      /** How often to check if bot is idle (ms) */
      idleCheckInterval?: number;
      /** Debounce delay for file changes (ms) */
      debounceDelay?: number;
      /** Logger function */
      logger?: {
        info: (msg: string, meta?: any) => void;
        warn: (msg: string, meta?: any) => void;
      };
    },
  ) {
    this.options.idleCheckInterval ??= 5000;
    this.options.debounceDelay ??= 1000;
    this.options.logger ??= {
      info: (msg) => console.log(`[RestartManager] ${msg}`),
      warn: (msg) => console.warn(`[RestartManager] ${msg}`),
    };
  }

  /**
   * Start watching for file changes
   */
  start() {
    const { watchPaths, logger } = this.options;

    logger!.info(`Starting file watcher for ${watchPaths.length} paths`);

    for (const watchPath of watchPaths) {
      try {
        const absolutePath = resolve(watchPath);
        const watcher = watch(absolutePath, { recursive: true }, (eventType, filename) => {
          logger!.info(`File event: ${eventType} on ${filename}`);
          if (filename) {
            this.onFileChange(filename);
          }
        });

        this.watchers.push(watcher);
        logger!.info(`Watching: ${absolutePath}`);
      } catch (error) {
        logger!.warn(`Failed to watch ${watchPath}: ${error}`);
      }
    }
  }

  /**
   * Stop watching and clear pending restart
   */
  stop() {
    const { logger } = this.options;

    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }

    this.restartPending = false;
    logger!.info("File watcher stopped");
  }

  /**
   * Handle file change event
   */
  private onFileChange(filename: string) {
    const { debounceDelay, logger } = this.options;

    // Ignore certain files
    if (this.shouldIgnoreFile(filename)) {
      return;
    }

    logger!.info(`File changed: ${filename}`);

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce file changes
    this.debounceTimer = setTimeout(() => {
      this.queueRestart();
    }, debounceDelay);
  }

  /**
   * Queue a restart to execute when idle
   */
  private queueRestart() {
    const { logger, isIdle, idleCheckInterval } = this.options;

    if (this.restartPending) {
      logger!.info("Restart already pending, skipping duplicate queue");
      return;
    }

    this.restartPending = true;
    logger!.warn("⏳ Restart queued - waiting for bot to become idle...");

    // Check if already idle
    if (isIdle()) {
      this.executeRestart();
      return;
    }

    // Start checking for idle state
    this.idleCheckTimer = setInterval(() => {
      if (isIdle()) {
        this.executeRestart();
      } else {
        logger!.info("Bot is busy, waiting for idle state...");
      }
    }, idleCheckInterval);
  }

  /**
   * Execute the restart
   */
  private executeRestart() {
    const { logger, onRestart } = this.options;

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }

    logger!.warn("🔄 Bot is idle - restarting now!");
    this.stop();
    onRestart();
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnoreFile(filename: string): boolean {
    const ignorePatterns = [
      /node_modules/,
      /\.cache/,
      /\.logs/,
      /\.git/,
      /\.nedb/,
      /\.sqlite/,
      /\.log$/,
      /\.md$/, // Ignore markdown files
      /~$/, // Ignore temp files
    ];

    return ignorePatterns.some((pattern) => pattern.test(filename));
  }
}
