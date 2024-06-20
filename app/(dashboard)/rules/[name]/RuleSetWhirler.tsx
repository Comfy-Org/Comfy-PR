"use client";
import CodeEditor from "@/components/CodeEditor";
import type { PullsStatus, PullStatus } from "@/src/analyzePullsStatus";
import type { updateFollowRuleSet } from "@/src/updateFollowRuleSet";
import { $ERROR, $OK, type Task } from "@/src/utils/Task";
import { tsmatch } from "@/src/utils/tsmatch";
import { yaml } from "@/src/utils/yaml";
import { revalidatePath } from "next/cache";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Markdown from "react-markdown";
import { PullsStatusTable } from "../../PullsStatusTable";
import { TaskDataOrNull } from "../TaskDataOrNull";

// import { useFormState } from "react-dom";

type MatchAllResults = { name: string; matched: Task<PullStatus[]>; actions: Task<any[]> }[];
/**
 * Author: snomiao <snomiao@gmail.com>
 */
export default function RuleSetWhirler({
  defaultYaml,
  updateFollowRuleSet,
  defaultMatchResults,
  defaultError,
  name,
  enabled,
}: {
  name: string;
  defaultYaml: string;
  updateFollowRuleSet: updateFollowRuleSet;
  defaultMatchResults?: Task<MatchAllResults>;
  defaultError?: string;
  enabled?: boolean;
}) {
  const [code, setCode] = useState<string>(defaultYaml);
  const [matchResults, setMatchResults] = useState<MatchAllResults | null>(TaskDataOrNull(defaultMatchResults));
  const [error, setError] = useState<string | null>(defaultError ?? null);
  const defaultLanguage = "yaml";
  const onChange = useCallback(
    async (code: string | undefined): Promise<void> => {
      if (code === undefined) return;
      setCode(code);
      const result = await updateFollowRuleSet({ yaml: code, name });
      // const result = await debounce(updateFollowRuleSet, 200)(code);
      tsmatch(result)
        .with($OK, ({ data }) => {
          setError(null);
          setMatchResults(data);
        })
        .with($ERROR, ({ error }) => {
          setError(yaml.stringify(error));
        });
    },
    [updateFollowRuleSet, name],
  );
  // useEffect(() => {
  //   onChange(defaultYaml);
  // }, [onChange, defaultYaml]);
  const router = useRouter();
  return (
    <div className="card overflow-hidden">
      <div className="flex">
        <div className="w-[35em]">
          <CodeEditor
            {...{
              onChange,
              defaultValue: defaultYaml,
              defaultLanguage,
              readOnly: enabled,
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
              {matchResults?.map(({ name, matched, actions }) => {
                return (
                  <details className="flex flex-col gap-8" key={name}>
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
                              return (
                                <div className="card">
                                  <PullsStatusTable {...{ pullsStatus }} />
                                </div>
                              );
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
                    {!!actions && (
                      <div className="card">
                        {tsmatch(actions)
                          .with($OK, ({ data }) => {
                            return (
                              <div className="card">
                                <h3>Actions Preview</h3>
                                <Markdown>{"```yaml\n" + yaml.stringify(data) + "\n```"}</Markdown>
                              </div>
                            );
                          })
                          .with($ERROR, ({ error }) => (
                            <div className="card">
                              <h3>Actions Parsing Error</h3>
                              <Markdown>{"```yaml\n" + yaml.stringify(error) + "\n```"}</Markdown>
                            </div>
                          ))
                          .otherwise(() => (
                            <>Loading...</>
                          ))}
                      </div>
                    )}
                  </details>
                );
              }) ?? <>No rules</>}
            </div>
          </div>
        </div>
      </div>
      <div className="card card-body">
        {enabled ? (
          <button
            onClick={async () => {
              await updateFollowRuleSet({ name, enable: false });
              router.refresh();
              if (typeof window !== "undefined") {
                document.location.href = document.location.href;
              }
              revalidatePath("/rules/" + name);
              revalidatePath("/rules");
            }}
            className="btn btn-error"
          >
            Disable Ruleset
          </button>
        ) : (
          <button
            onClick={async () => {
              const result = await updateFollowRuleSet({ yaml: code, name, enable: true });
              tsmatch(result)
                .with($OK, ({ data }) => {
                  setError(null);
                  setMatchResults(data);

                  if (typeof window !== "undefined") {
                    document.location.href = document.location.href;
                  }
                  router.refresh();
                  revalidatePath("/rules/" + name);
                  revalidatePath("/rules");
                })
                .with($ERROR, ({ error }) => {
                  setError(yaml.stringify(error));
                });
            }}
            className="btn btn-info"
            disabled={!!error || !matchResults}
          >{`I've confirmed all rules is matching correct contents and plz ENABLE this rule set NOW`}</button>
        )}
      </div>
    </div>
  );
}
