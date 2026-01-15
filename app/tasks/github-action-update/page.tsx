import { getAuthUser } from "@/app/api/auth/[...nextauth]/getAuthUser";
import "@/app/markdown.css";
import "@/app/tasks-panel.css";
import { parseTitleBodyOfMarkdown } from "@/src/parseTitleBodyOfMarkdown";
import { yaml } from "@/src/utils/yaml";
import { compareBy } from "comparing";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listGithubActionUpdateTask } from "./actions";
import { ApprovePRButton } from "./ApprovePRButton";
import ProgressBarChart from "./ProgressBarChart";
import { ResetTaskButton } from "./ResetTaskButton";

// TODO: automatically generate this hash
// export const referenceActionContent = await readFile("./templates/publish.yaml", "utf8");
// export const referencePullRequestMessage = await readFile("./templates/tasks/GithubActionUpdatePR.md", "utf8");
// export const referenceActionContentHash = sha256(referenceActionContent); // check if target publish.yaml already latest
// console.log("referenceActionContentHash", referenceActionContentHash);
const referenceActionContentHash =
  "e6de732024cf2b64488ec093818fc2e01707c9bc97d306a42b3c22d2ef834686";

export const metadata: Metadata = {
  title: `GithubActionUpdateTaskPage - ComfyPR`,
};

/**
 * @author: snomiao <snomiao@gmail.com>
 * @description:
 */
export default async function GithubActionUpdateTaskPage() {
  const user = await getAuthUser();
  if (!user.admin) return forbidden();
  const data = await listGithubActionUpdateTask();

  function filterHopper<T>(values: T[], predicates: Array<(value: T) => any>) {
    return predicates.reduce((acc, predicate) => {
      acc.push(values.filter((e) => !!predicate(e)));
      values = values.filter((e) => !predicate(e));
      return acc;
    }, [] as T[][]);
  }

  // categorize data
  const [
    noPublishYamlErrorData,
    errorData,
    upToDatedData,
    prClosedData,
    prMergedData,
    prOpenedData,
    pendingCreatePRData,
    pendingReviewsData,
    processingData,
  ] = filterHopper(data, [
    (e) => e.error?.match("expected exactly 1 publish.yaml file, but got 0"),
    (e) => e.error,
    (e) =>
      e.upToDateHash === referenceActionContentHash ||
      (e.branchVersionHash && !e.pullRequestMessage),
    (e) => e.pullRequestStatus === "CLOSED", // got results
    (e) => e.pullRequestStatus === "MERGED", // got results
    (e) => e.pullRequestVersionHash === referenceActionContentHash, // opened
    (e) => e.approvedBranchVersionHash === referenceActionContentHash, // approved and pending create pr
    (e) => e.branchVersionHash && e.pullRequestMessage, // branch created and pending reviews
    (e) => true, // all other is processing
  ]);

  const chartData = {
    data: [
      ["Processing", processingData.length, "oklch(0.8 0.180 136)"], // A greenish color
      ["Pending Reviews", pendingReviewsData.length, "oklch(0.7 0.15 72)"], // A yellowish color
      ["Pending Create PR", pendingCreatePRData.length, "oklch(0.75 0.150 198)"], // A bluish color
      ["PR Opened", prOpenedData.length, "oklch(0.8 0.125 320)"], // A purple color
      ["PR Merged", prMergedData.length, "oklch(0.6 0.125 320)"], // A purple color
      ["Up to dated", upToDatedData.length, "oklch(0.6 0.125 320)"], // A purple color

      // error
      ["PR Closed", prClosedData.length, "oklch(0.5 0.125 320)"], // A closed color
      ["Error", errorData.length, "oklch(0.6 0.179 29)"], // A reddish color
      ["Error: No publish.yaml", noPublishYamlErrorData.length, "oklch(0.6 0.179 29)"], // A reddish color
    ] as readonly [string, number, string][],
  };
  return (
    <div className="tasks-panel p-8 gap-4">
      <h1>GithubActionUpdateTasks in Total x{data.length}</h1>

      <div>
        <ProgressBarChart data={chartData.data} />
      </div>

      <ol>
        <li>Bot are Drafting PRs x{processingData.length}</li>
        <li>Pending Reviews x{pendingReviewsData.length}</li>
        <li>Pending Create Pull Request x{pendingCreatePRData.length}</li>
        <li>Pull Request Opened x{prOpenedData.length}</li>
        <li>Pull Request Merged x{prMergedData.length}</li>
        <li>Pull Request Closed x{prClosedData.length}</li>
        <li>Errors x{errorData.length}</li>
        <li>No publish.yaml Error x{noPublishYamlErrorData.length}</li>
      </ol>

      <a
        href="https://github.com/Comfy-Org/Comfy-PR/actions/workflows/updateGithubActionTask.yaml"
        target="_blank"
        className="btn"
      >
        Check Actions
      </a>

      <details>
        <summary>
          <h2>Drafting PRs x{processingData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4">
          {processingData.map((e, i, a) => {
            return (
              <li key={e.repo}>
                {i + 1}.{" "}
                <a target="_blank" href={e.repo}>
                  {e.repo}
                </a>
              </li>
            );
          })}
        </ol>
      </details>

      <details open>
        <summary>
          <h2>Pending Reviews x{pendingReviewsData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4">
          {[...pendingReviewsData].sort(compareBy((e) => e.repo)).map((e, i) => (
            <li key={e.repo} className="flex flex-col my-4">
              <div className="flex justify-between">
                <span className="text-xl font-bold">
                  {i + 1}. Updating publish.yaml for{" "}
                  <a target="_blank" href={e.repo}>
                    {e.repo}
                  </a>
                </span>
                <div className="flex gap-4">
                  <ResetTaskButton repo={e.repo} />
                  {" | "}
                  <ApprovePRButton repo={e.repo} branchVersionHash={e.branchVersionHash} />
                </div>
              </div>

              <div className="flex max-h-[70em] max-w-full overflow-auto gap-4">
                <div className="flex flex-col flex-grow">
                  <h3>DRAFTED PULL REQUEST MESSAGE</h3>
                  <Markdown
                    className="overflow-auto markdown markdown-frame w-full"
                    remarkPlugins={[remarkGfm]}
                  >
                    {e.pullRequestMessage ?? ""}
                  </Markdown>
                </div>
                <div className="flex shrink flex-col max-h-full overflow-auto flex-grow">
                  <div className="flex flex-col">
                    <div>
                      <a target="_blank" href={e.forkedBranchUrl}>
                        <h3>COMMIT MESSAGE</h3>
                      </a>
                    </div>
                    <code className="whitespace-pre-wrap block overflow-auto markdown markdown-frame w-full !m-0">
                      {e.commitMessage ?? ""}
                    </code>
                  </div>
                  <div className="flex flex-col">
                    <h3>BRANCH DIFF RESULT</h3>
                    {/* {!!e.branchDiffResult && <>{e.branchDiffResult}</>} */}
                    {/* {!!e.branchDiffResult && <GitDiffResult>{e.branchDiffResult}</GitDiffResult>} */}
                    {!!e.branchDiffResult && (
                      <code className="whitespace-pre-wrap block overflow-auto markdown markdown-frame w-full !m-0">
                        {e.branchDiffResult}
                      </code>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </details>

      <details open>
        <summary>
          <h2>Pending Create Pull Request x{pendingCreatePRData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4 gap-4">
          {pendingCreatePRData.map((e, i) => {
            return (
              <li key={e.repo}>
                {i + 1}.{" "}
                <a target="_blank" href={e.repo}>
                  {e.repo}
                </a>{" "}
                - Creating PR [{parseTitleBodyOfMarkdown(e.pullRequestMessage!).title}]...
                <ResetTaskButton repo={e.repo} />
              </li>
            );
          })}
        </ol>
      </details>

      <details open>
        <summary>
          <h2>Pull Request Opened x{prOpenedData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4 gap-4">
          {prOpenedData.map((e, i) => {
            return (
              <li key={e.repo}>
                {i + 1}. <span>{e.pullRequestStatus}</span>
                <a target="_blank" href={e.repo}>
                  {e.repo}
                </a>{" "}
                - Opened PR
                <a target="_blank" href={e.pullRequestUrl}>
                  {parseTitleBodyOfMarkdown(e.pullRequestMessage!).title}
                </a>
                {e.pullRequestComments && (
                  <pre className="whitespace-pre-wrap p-4 m-4 rounded-sm text-white bg-black ">
                    {"Comments:\n" + e.pullRequestComments}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      <details open>
        <summary>
          <h2>Pull Request Merged x{prMergedData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4 gap-4">
          {prMergedData.map((e, i) => {
            return (
              <li key={e.repo}>
                {i + 1}.{" "}
                <a target="_blank" href={e.repo}>
                  {e.repo}
                </a>{" "}
                - Merged PR
                <a target="_blank" href={e.pullRequestUrl}>
                  {parseTitleBodyOfMarkdown(e.pullRequestMessage!).title}
                </a>
                {e.pullRequestComments && (
                  <pre className="whitespace-pre-wrap p-4 m-4 rounded-sm text-white bg-black ">
                    {"Comments:\n" + e.pullRequestComments}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      <details open>
        <summary>
          <h2>Pull Request Closed x{prClosedData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4 gap-4">
          {prClosedData.map((e, i) => {
            return (
              <li key={e.repo}>
                {i + 1}.{" "}
                <a target="_blank" href={e.repo}>
                  {e.repo}
                </a>{" "}
                - Closed PR
                <a target="_blank" href={e.pullRequestUrl}>
                  {parseTitleBodyOfMarkdown(e.pullRequestMessage!).title}
                </a>
                {e.pullRequestComments && (
                  <pre className="whitespace-pre-wrap p-4 m-4 rounded-sm text-white bg-black ">
                    {"Comments:\n" + e.pullRequestComments}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      <details open>
        <summary>
          <h2>Errors x{errorData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4 gap-4">
          {errorData.map((e, i, a) => {
            return (
              <li key={e.repo}>
                <div className="flex justify-between px-4">
                  <span>
                    {i + 1}.{" "}
                    <a target="_blank" href={e.repo}>
                      {e.repo}
                    </a>
                  </span>
                  <ResetTaskButton repo={e.repo} />
                </div>
                <pre className="whitespace-pre-wrap p-4 m-4 rounded-sm text-white bg-black ">
                  {yaml.stringify(e)}
                </pre>
              </li>
            );
          })}
        </ol>
      </details>

      <details open>
        <summary>
          <h2>No publish.yaml Error x{noPublishYamlErrorData.length}</h2>
        </summary>
        <ol className="flex flex-col max-w-full px-4 gap-4">
          {noPublishYamlErrorData.map((e, i, a) => {
            return (
              <li key={e.repo}>
                <div className="flex justify-between px-4">
                  <span>
                    {i + 1}.{" "}
                    <a target="_blank" href={e.repo}>
                      {e.repo}
                    </a>
                  </span>
                  <ResetTaskButton repo={e.repo} />
                </div>
                <pre className="whitespace-pre-wrap p-4 m-4 rounded-sm text-white bg-black ">
                  {yaml.stringify(e)}
                </pre>
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}
