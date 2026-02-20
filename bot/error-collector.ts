/**
 * Error Collector - Monitors child workspace for errors and collects them
 */

import { readdir, readFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface ErrorCollectorOptions {
  workspaceDir: string;
  outputLogPath: string;
  onError?: (errorPath: string, content: string) => void;
  checkInterval?: number; // milliseconds
}

export class ErrorCollector {
  private workspaceDir: string;
  private outputLogPath: string;
  private onError?: (errorPath: string, content: string) => void;
  private checkInterval: number;
  private intervalId?: Timer;
  private processedErrors = new Set<string>();

  constructor(options: ErrorCollectorOptions) {
    this.workspaceDir = options.workspaceDir;
    this.outputLogPath = options.outputLogPath;
    this.onError = options.onError;
    this.checkInterval = options.checkInterval || 10000; // 10 seconds default
  }

  async start() {
    // Ensure output directory exists
    await mkdir(path.dirname(this.outputLogPath), { recursive: true });

    // Initial scan
    await this.scanForErrors();

    // Periodic scanning
    this.intervalId = setInterval(() => {
      this.scanForErrors().catch((err) => {
        console.error("[ErrorCollector] Scan failed:", err);
      });
    }, this.checkInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async scanForErrors() {
    const errorPatterns = [
      "**/ERRORS.md",
      "**/ERROR*.md",
      "**/*-ERRORS.md",
      "**/.logs/*error*.log",
      "**/.logs/*ERROR*.log",
    ];

    for (const pattern of errorPatterns) {
      await this.findAndProcessErrors(pattern);
    }
  }

  private async findAndProcessErrors(_pattern: string) {
    try {
      // Simple glob-like search - check common locations
      const logsDir = path.join(this.workspaceDir, ".logs");
      const rootDir = this.workspaceDir;

      const dirsToCheck = [logsDir, rootDir];

      for (const dir of dirsToCheck) {
        if (!existsSync(dir)) continue;

        const files = await readdir(dir).catch(() => []);

        for (const file of files) {
          const filePath = path.join(dir, file);

          // Check if file matches error patterns
          const isErrorFile =
            file.includes("ERROR") ||
            file.includes("error") ||
            file.match(/.*-ERRORS?\.md$/i) ||
            file.match(/TOOLS[_-]ERRORS\.md$/i);

          if (isErrorFile && !this.processedErrors.has(filePath)) {
            await this.processErrorFile(filePath);
          }
        }
      }
    } catch (err) {
      console.error("[ErrorCollector] Error scanning:", err);
    }
  }

  private async processErrorFile(errorPath: string) {
    try {
      const content = await readFile(errorPath, "utf-8");

      if (!content.trim()) {
        return; // Skip empty files
      }

      // Mark as processed
      this.processedErrors.add(errorPath);

      // Log to output
      const timestamp = new Date().toISOString();
      const relPath = path.relative(this.workspaceDir, errorPath);
      const logEntry = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[${timestamp}] Error found in: ${relPath}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

      await appendFile(this.outputLogPath, logEntry);

      // Call callback if provided
      if (this.onError) {
        this.onError(errorPath, content);
      }
    } catch (err) {
      console.error(`[ErrorCollector] Failed to process ${errorPath}:`, err);
    }
  }
}
