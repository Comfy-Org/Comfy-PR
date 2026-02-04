import Link from "next/link";
import { Suspense } from "react";
import { GithubBugcopTask } from "../../bot/gh-bugcop/gh-bugcop";
import { GithubBountyTask } from "./gh-bounty/gh-bounty";
import { GithubDesignTask } from "./gh-design/gh-design";
import {
  GithubContributorAnalyzeTask,
  GithubContributorAnalyzeTaskFilter,
} from "./github-contributor-analyze/GithubContributorAnalyzeTask";

// Prevent static generation since this page requires database access
export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function TasksIndexPage() {
  // Dynamic imports to avoid build-time execution
  const { GithubActionUpdateTask } =
    await import("@/src/GithubActionUpdateTask/GithubActionUpdateTask");

  const Counts = {
    GithubActionUpdateTask: () => (
      <Suspense>{GithubActionUpdateTask.estimatedDocumentCount()}</Suspense>
    ),
    GithubContributorAnalyzeTask: () => (
      <Suspense>{GithubContributorAnalyzeTask.estimatedDocumentCount()}</Suspense>
    ),
    GithubContributorAnalyzeTaskRemain: () => (
      <Suspense>
        {GithubContributorAnalyzeTask.countDocuments(GithubContributorAnalyzeTaskFilter)}
      </Suspense>
    ),
    GithubBountyTask: () => <Suspense>{GithubBountyTask.estimatedDocumentCount()}</Suspense>,
    GithubDesignTask: () => <Suspense>{GithubDesignTask.estimatedDocumentCount()}</Suspense>,
  };

  return (
    <ol className="px-8">
      <li>
        <Link href="/tasks/github-action-update">
          GithubActionUpdateTask x {<Counts.GithubActionUpdateTask />}
        </Link>
      </li>
      <li>
        <Link href="/tasks/github-contributor-analyze">
          GithubContributorAnalyzeTask Total {<Counts.GithubContributorAnalyzeTask />} (remain:{" "}
          {<Counts.GithubContributorAnalyzeTaskRemain />})
        </Link>
      </li>
      <li>
        <Link href="/tasks/gh-bounty">GithubBountyTask x {<Counts.GithubBountyTask />}</Link>
      </li>
      <li>
        <Link href="/tasks/gh-design">GithubDesignTask x {<Counts.GithubDesignTask />}</Link>
      </li>
      <li>
        <Link href="/tasks/gh-bugcop">
          GitHub BugCop Task x <Suspense>{GithubBugcopTask.estimatedDocumentCount()}</Suspense>
        </Link>
      </li>
    </ol>
  );
}
