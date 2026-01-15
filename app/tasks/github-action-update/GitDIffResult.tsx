"use client";
import { Diff, Hunk, parseDiff } from "react-diff-view";

export function GitDiffResult({ children }: { children: string }) {
  const FallbackPlainCode = () => (
    <code className="whitespace-pre-wrap block overflow-auto markdown markdown-frame w-full !m-0">
      {children}
    </code>
  );
  try {
    return (
      <div>
        {parseDiff(children)?.map((file, i) => {
          const { oldRevision, newRevision, type, hunks } = file;
          return (
            <Diff
              key={oldRevision + "-" + newRevision}
              viewType="split"
              diffType={type}
              hunks={hunks}
            >
              {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
            </Diff>
          );
        })}
      </div>
    );
  } catch (e) {
    return <FallbackPlainCode />;
  }
}
