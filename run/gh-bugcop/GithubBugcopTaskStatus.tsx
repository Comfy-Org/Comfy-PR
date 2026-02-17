import type { GH } from "@/lib/github";
import { Box, render, Text } from "ink";
import type { WithId } from "mongodb";
import prettyMilliseconds from "pretty-ms";
import { useEffect, useState } from "react";
import sflow from "sflow";
import useAsyncEffect from "use-async-effect";
import {
  BUGCOP_ANSWERED,
  BUGCOP_ASKING_FOR_INFO,
  BUGCOP_RESPONSE_RECEIVED,
  GithubBugcopTask,
} from "./gh-bugcop";

if (import.meta.main) render(<GithubBugcopTaskStatus />);

export default function GithubBugcopTaskStatus({}) {
  // NOTE: THIS IS A CLI COMPONENT, AND RUNNING IN GITHUB ACTION, NOT A WEBPAGE
  const [data, setData] = useState<WithId<GithubBugcopTask>[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // Color mappers
  const getStatusColor = (labels?: string[]) => {
    if (labels?.includes(BUGCOP_ASKING_FOR_INFO)) return "yellow";
    if (labels?.includes(BUGCOP_ANSWERED)) return "blue";
    if (labels?.includes(BUGCOP_RESPONSE_RECEIVED)) return "green";
    return "red";
  };

  const taskStatusColorMap: Record<string, string> = {
    responseReceived: "green",
    askForInfo: "yellow",
  };

  const taskActionColorMap: Record<string, string> = {
    ok: "green",
    processing: "yellow",
    error: "red",
  };

  const getUpdatedAtColor = (updatedAt?: Date) => {
    if (!updatedAt) return "gray";
    const daysSince = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 3) return "green";
    if (daysSince < 7) return "yellow";
    if (daysSince < 15) return "red";
    return "gray";
  };

  useAsyncEffect(async () => {
    const ac = new AbortController();
    // init query
    setData(await sflow(GithubBugcopTask.find({})).toArray());

    // watch for changes
    sflow(
      GithubBugcopTask.watch([], {
        fullDocument: "whenAvailable", // this is needed to get the full document on insert/update
        // fullDocumentBeforeChange: 'required', // this is not needed, we can
      }),
    )
      .abort(ac.signal)
      .filter(
        (change) =>
          change.operationType === "insert" ||
          change.operationType === "update" ||
          change.operationType === "delete",
      )
      .forEach(async (change) => {
        if (change.operationType === "insert" || change.operationType === "update") {
          // console.log('change', change);
          if (!change.fullDocument) {
            // tlog('change.fullDocument is undefined, this should not happen, skipping change', change);

            // if we are here, it means the change is an update without fullDocument, so we need to re-fetch all tasks
            setData(await sflow(GithubBugcopTask.find({})).toArray());
            return;
          }
          const doc = change.fullDocument as WithId<GithubBugcopTask>;
          setData((prev) => {
            const idx = prev.findIndex((t) => t.url === doc.url);
            if (idx >= 0) {
              prev[idx] = doc;
              return [...prev];
            } else {
              return [...prev, doc];
            }
          });
        } else if (change.operationType === "delete") {
          setData((prev) => prev.filter((t) => t._id !== change.documentKey._id));
        }
      })
      .run();
    return () => ac.abort();
  }, []);

  // rerender per second
  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => [...prev]); // trigger re-render
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // TODO: show logs
  return (
    <Box width="100%" flexDirection="column">
      <Text color="green">Github Bugcop Task Running...</Text>
      {logs.map((log, idx) => (
        <Text key={idx} color="cyan">
          {log}
        </Text>
      ))}

      <Text color="blue">Status:</Text>
      {data.map((task) => {
        const statusColor = getStatusColor(task.labels);
        const taskStatusColor = taskStatusColorMap[task.status ?? ""] ?? "red";
        const taskActionColor = taskActionColorMap[task.taskStatus ?? ""] ?? "gray";

        return (
          <Box key={task.url} flexDirection="column">
            <Text color={statusColor}>
              {" "}
              • <Text backgroundColor={taskStatusColor}>{task.status ?? "unknown"}</Text> {task.url}
            </Text>
            <Box flexDirection="column">
              <Box flexDirection="row">
                <Text> ├─ </Text>
                <Text color={taskActionColor}>{task.taskStatus ?? "unknown"}</Text>
                <Text> | {task.statusReason}</Text>
                {task.user && <Text> | @{task.user}</Text>}
                {task.labels?.length ? <Text> | Labels: {task.labels.join(", ")}</Text> : null}
              </Box>
              <Box flexDirection="row">
                <Text> ├─ Updated at: </Text>
                <Text color={getUpdatedAtColor(task.updatedAt)}>
                  {task.updatedAt
                    ? prettyMilliseconds(Date.now() - new Date(task.updatedAt).getTime()) + " ago"
                    : "never"}
                </Text>
              </Box>
              <Box flexDirection="row">
                <Text wrap="truncate">
                  {" "}
                  ├─ Body: {task.body ? task.body.replace(/\s+/g, " ").trim() : "No content"}
                </Text>
              </Box>
              {task.timeline?.length ? (
                <Box flexDirection="column">
                  <Text> └─ Timeline Events ({task.timeline.length}):</Text>
                  <Text>
                    {task.timeline
                      .slice(-5)
                      .map((event, idx) => {
                        const eventTime = new Date(
                          (event as Record<string, unknown>).created_at as string,
                        ).toISOString();
                        const actor =
                          ((
                            (event as Record<string, unknown>).actor as
                              | Record<string, unknown>
                              | undefined
                          )?.login as string) || "unknown";

                        let eventDesc = "";
                        if (event.event === "labeled") {
                          const labelEvent = event as GH["labeled-issue-event"];
                          eventDesc = `+ label:${labelEvent.label.name}`;
                        } else if (event.event === "unlabeled") {
                          const unlabelEvent = event as GH["unlabeled-issue-event"];
                          eventDesc = `- label:${unlabelEvent.label.name}`;
                        } else if (event.event === "commented") {
                          const commentEvent = event as GH["timeline-comment-event"];
                          eventDesc = `comment: ${commentEvent.body?.slice(0, 30)?.replace(/\s+/g, " ")?.trim() || "no content"}...`;
                        } else {
                          eventDesc = `${event.event}`;
                        }

                        return `     ${idx === task.timeline!.slice(-5).length - 1 ? "└─" : "├─"} ${eventTime} @${actor} ${eventDesc}`;
                      })
                      .join("\n")}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
