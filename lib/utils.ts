import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
/**
 * Prompts the user with a yes/no question in the terminal and returns their response as a boolean.
 *
 * @param {string} question - The question to display to the user.
 * @returns {Promise<boolean>} - Resolves to `true` if the user answers "y" or "yes" (case-insensitive), otherwise `false`.
 *
 * @example
 * const answer = await confirm("Do you want to continue?");
 * if (answer) {
 *   // User confirmed
 * } else {
 *   // User declined
 * }
 */
export async function confirm(question: string) {
  return new Promise<boolean>((resolve) => {
    process.stdin.resume();
    process.stdout.write(`${question} (y/n): `);
    process.stdin.once("data", function (data) {
      const answer = data.toString().trim().toLowerCase();
      process.stdin.pause();
      resolve(answer === "y" || answer === "yes");
    });
  });
}

/**
 * Truncate text from the middle, preserving start and end
 */
export function truncateFromMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncationMarker = "\n\n...TRUNCATED...\n\n";
  const markerLength = truncationMarker.length;
  const halfLength = Math.floor((maxLength - markerLength) / 2);

  return text.slice(0, halfLength) + truncationMarker + text.slice(-halfLength);
}
