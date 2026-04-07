#!/usr/bin/env bun
/**
 * One-shot cleanup for PRs that were labeled with `released:core` /
 * `released:cloud` by an earlier version of the release-tagger that
 * indiscriminately labeled direct-merge PRs (version bumps, branch-only
 * fixups, title-style backports). The current task no longer labels these,
 * so this script removes the stale labels from the affected issues.
 */
import { gh } from "@/lib/github";
import { logger } from "@/src/logger";

const FRONTEND_REPO = { owner: "Comfy-Org", repo: "ComfyUI_frontend" };

// Mislabeled PRs identified from the PRReleaseTaggerState collection on
// 2026-04-08. Each entry is a PR on the release branch (or a release-cut
// commit) that should not carry a released:* label.
const MISLABELED: Array<{ prNumber: number; label: "released:core" | "released:cloud" }> = [
  // Version-bump release commits on core/1.41
  { prNumber: 9763, label: "released:core" },
  { prNumber: 9762, label: "released:core" },
  { prNumber: 9754, label: "released:core" },
  { prNumber: 9747, label: "released:core" },
  // Backport PRs themselves (originals are now correctly labeled by the new title parser)
  { prNumber: 9746, label: "released:core" },
  { prNumber: 10507, label: "released:cloud" },
  { prNumber: 9855, label: "released:cloud" },
  // Branch-only fixups
  { prNumber: 10269, label: "released:cloud" },
  { prNumber: 10101, label: "released:cloud" },
];

async function main() {
  for (const { prNumber, label } of MISLABELED) {
    try {
      await gh.issues.removeLabel({
        ...FRONTEND_REPO,
        issue_number: prNumber,
        name: label,
      });
      logger.info(`removed ${label} from #${prNumber}`);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        logger.info(`#${prNumber} does not have ${label} (already clean)`);
      } else {
        logger.error(`failed to remove ${label} from #${prNumber}: ${(err as Error).message}`);
      }
    }
  }
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
