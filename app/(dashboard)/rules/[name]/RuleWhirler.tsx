"use client";

import CodeEditor from "@/components/CodeEditor";
import { $ERROR, $OK, type Task } from "@/src/utils/Task";
import { tsmatch } from "@/src/utils/tsmatch";
import { yaml } from "@/src/utils/yaml";
import { useState } from "react";
import Markdown from "react-markdown";

// import { useFormState } from "react-dom";

/**
 * Author: snomiao <snomiao@gmail.com>
 */
export default function RuleWhirler({
  onChange,
  defaultValue,
}: {
  onChange: (yaml: string) => Promise<Task<any>>;
  defaultValue: string;
}) {
  const [results, setResults] = useState<Task<any[]>>();
  const defaultLanguage = "yaml";
  return (
    <div className="card card-body overflow-hidden">
      <div className="flex">
        <div className="grow">
          <CodeEditor
            {...{
              onChange: async (code) => {
                if (code === undefined) return;
                const results = await onChange(code);
                setResults(results);
              },
              defaultValue,
              defaultLanguage,
            }}
            height="80vh"
          />
        </div>
        <div className="card-body bg-cyan-600 w-[40%]">
          <Markdown>
            {`${tsmatch(results)
              .with($OK, ({ data }) => {
                return yaml.stringify(data);
              })
              .with($ERROR, ({ error }) => {
                return yaml.stringify(error);
              })
              .otherwise(() => {
                // maybe pending
                return "no results yet";
              })}`}
          </Markdown>
        </div>
      </div>
    </div>
  );
}
