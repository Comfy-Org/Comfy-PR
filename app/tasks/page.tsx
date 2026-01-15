import { GithubActionUpdateTask } from "@/src/GithubActionUpdateTask/GithubActionUpdateTask";
import Link from "next/link";
import { Suspense } from "react";
import { GithubBugcopTask } from "../../run/gh-bugcop/gh-bugcop";
import { GithubBountyTask } from "./gh-bounty/gh-bounty";
import { GithubDesignTask } from "./gh-design/gh-design";
import {
  GithubContributorAnalyzeTask,
  GithubContributorAnalyzeTaskFilter,
} from "./github-contributor-analyze/GithubContributorAnalyzeTask";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function TasksIndexPage() {
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
