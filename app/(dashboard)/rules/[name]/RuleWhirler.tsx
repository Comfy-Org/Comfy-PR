"use client";
import CodeEditor from "@/components/CodeEditor";
import type { PullsStatus, PullStatus } from "@/src/analyzePullsStatus";
import { $ERROR, $OK, type Task } from "@/src/utils/Task";
import { tsmatch } from "@/src/utils/tsmatch";
import { yaml } from "@/src/utils/yaml";
import { debounce } from "lodash-es";
import { useCallback, useEffect, useState } from "react";
import Markdown from "react-markdown";
import { PullsStatusTable } from "../../PullsStatusTable";
import { TaskDataOrNull } from "../TaskDataOrNull";

// import { useFormState } from "react-dom";

/**
 * Author: snomiao <snomiao@gmail.com>
 */
export default function RuleWhirler({
  matchAll,
  defaultYaml,
}: {
  matchAll: (yaml: string) => Promise<Task<{ name: string; matched: Task<PullStatus[]> }[]>>;
  defaultYaml: string;
}) {
  const [error, setError] = useState<string>();
  const [matchResults, setMatchResults] = useState<{ name: string; matched: Task<PullStatus[]> }[]>();
  const defaultLanguage = "yaml";
  const onChange = useCallback(
    async (code: string | undefined): Promise<void> => {
      if (code === undefined) return;
      const result = await debounce(matchAll, 200)(code);
      tsmatch(result)
        .with($OK, ({ data }) => {
          setError(undefined);
          setMatchResults(data);
        })
        .with($ERROR, ({ error }) => {
          setError(yaml.stringify(error));
        });
    },
    [matchAll],
  );
  useEffect(() => {
    onChange(defaultYaml);
  }, [onChange, defaultYaml]);
  return (
    <div className="card overflow-hidden">
      <div className="flex">
        <div className="w-[35em]">
          <CodeEditor
            {...{
              onChange,
              defaultValue: defaultYaml,
              defaultLanguage,
            }}
            height="70vh"
          />
        </div>
        <div className="card-body bg-cyan-600 w-[30%] gap-4 overflow-auto h-[70vh]">
          {error && (
            <div className="card p-2 shadow-sm bg-error">
              <Markdown>{"```yaml\n" + yaml.stringify(error) + "\n```"}</Markdown>
            </div>
          )}
          <div>
            <h3>Rules</h3>
            <div className="flex gap-2 flex-col">
              {matchResults?.map(({ name, matched }) => {
                return (
                  <details className="flex flex-col" key={name}>
                    <summary className="btn">
                      {name} -- {TaskDataOrNull(matched)?.length ?? "Error"}
                    </summary>
                    {!!matched && (
                      <div className="card">
                        <h3 className="text-xl">{name}</h3>
                        <div>
                          {tsmatch(matched)
                            .with($OK, ({ data }) => {
                              const pullsStatus = data as PullsStatus;
                              if (!pullsStatus.length) return <>NOTHING MATCHED</>;
                              return <PullsStatusTable {...{ pullsStatus }} />;
                            })
                            .with($ERROR, ({ error }) => (
                              <Markdown>{"```yaml\n" + yaml.stringify(error) + "\n```"}</Markdown>
                            ))
                            .otherwise(() => (
                              <>Loading...</>
                            ))}
                        </div>
                      </div>
                    )}
                  </details>
                );
              }) ?? <>No rules</>}
            </div>
          </div>
        </div>
      </div>
      {/* <div>
        <h2 className="text-2xl">Matched Rules</h2>
        <div className="flex gap-4 flex-col">
          {toPairs(matchResults).map(([ruleName, result]) => (
            
          ))}
        </div>
      </div> */}
    </div>
  );
}
