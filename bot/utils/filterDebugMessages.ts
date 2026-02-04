/**
 * Filter debugging messages and internal system info from terminal output
 * to prevent them from being shown to end users in Slack.
 */

/**
 * Patterns to filter out from terminal output before showing to users.
 * These are internal debugging messages and system info that aren't relevant to users.
 */
const DEBUG_PATTERNS = [
  // Upload retry messages
  /retrying.*upload/i,
  /retry.*slack/i,
  /uploading.*retry/i,

  // File system paths (absolute paths)
  /\/repos\/[^\s]+/g,
  /\/home\/[^\s]+/g,
  /\/tmp\/[^\s]+/g,
  /\/var\/[^\s]+/g,
  /\/opt\/[^\s]+/g,
  /file:\/\/[^\s]+/g,

  // Process and system info
  /\bPID\s*:\s*\d+/gi,
  /\bprocess\s+id\s*:\s*\d+/gi,
  /\bprocess\.\w+/g,
  /\bexit\s+code\s*:\s*\d+/gi,

  // Timestamp patterns (various formats)
  /\[\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g,
  /\d{2}:\d{2}:\d{2}\.\d{3}/g,
  /timestamp:\s*\d+/gi,

  // ANSI escape codes (terminal colors/formatting)
  /\x1b\[[0-9;]*[mGKHf]/g,
  /\033\[[0-9;]*[mGKHf]/g,

  // Terminal control characters
  /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g,

  // System/environment info
  /\bnode_modules\b/g,
  /\bbun\s+run\b/gi,
  /\bnpm\s+run\b/gi,
  /\byarn\s+run\b/gi,

  // Git internal messages
  /^git\s+/gm,
  /^\s*HEAD\s+is\s+now\s+at/gm,
  /^\s*From\s+https?:\/\//gm,

  // Debug/trace logging prefixes (entire lines)
  /^\s*\[DEBUG\].*$/gmi,
  /^\s*\[TRACE\].*$/gmi,
  /^\s*\[VERBOSE\].*$/gmi,

  // Stack traces (partial - first line indicators)
  /^\s*at\s+\w+\s+\([^)]+:\d+:\d+\)/gm,
  /^\s*Error:\s+/gm,
];

/**
 * Filter internal debugging messages and system info from terminal output.
 *
 * This function removes:
 * - Retry/upload debugging messages
 * - Absolute file paths
 * - Process/PID information
 * - Timestamps
 * - ANSI escape codes and terminal control characters
 * - System environment info
 * - Git internal messages
 * - Debug/trace logging
 * - Stack traces
 *
 * @param rawOutput - Raw terminal output containing debugging messages
 * @returns Cleaned output suitable for displaying to end users
 *
 * @example
 * ```typescript
 * const raw = "retrying the slack upload...\nTask completed successfully\n/repos/user/project/file.ts";
 * const clean = filterInternalThoughts(raw);
 * // Returns: "Task completed successfully"
 * ```
 */
export function filterInternalThoughts(rawOutput: string): string {
  let filtered = rawOutput;

  // Apply all debug patterns
  for (const pattern of DEBUG_PATTERNS) {
    filtered = filtered.replace(pattern, '');
  }

  // Split into lines and process
  const lines = filtered.split('\n')
    .map(line => line.trim())
    .filter(line => {
      // Remove empty lines
      if (!line) return false;

      // Remove lines that are just punctuation/symbols
      if (/^[^\w\s]*$/.test(line)) return false;

      // Remove lines that look like log prefixes without content
      if (/^[\[\]\-\s]+$/.test(line)) return false;

      return true;
    });

  // Join back together
  const result = lines.join('\n').trim();

  return result;
}

/**
 * Extract what was filtered out for logging purposes.
 *
 * @param rawOutput - Original raw output
 * @param filteredOutput - Output after filtering
 * @returns Array of filtered-out lines
 */
export function getFilteredContent(rawOutput: string, filteredOutput: string): string[] {
  const rawLines = rawOutput.split('\n').map(l => l.trim()).filter(Boolean);
  const filteredLines = new Set(filteredOutput.split('\n').map(l => l.trim()).filter(Boolean));

  return rawLines.filter(line => !filteredLines.has(line));
}
