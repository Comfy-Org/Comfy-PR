import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { GithubBugcopTask } from "./gh-bugcop";

/**
 * GitHub Bug Cop Task Dashboard
 * Displays all bug-cop-labeled issues and PRs being tracked
 */
export default async function GithubBugCopTaskPage() {
  // Fetch all tasks from the database
  const tasks = await GithubBugcopTask.find({}).sort({ lastChecked: -1 }).toArray();

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return "N/A";
    try {
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(date));
    } catch {
      return "Invalid Date";
    }
  };

  const getIssueNumber = (url: string) => {
    const match = url.match(/\/(\d+)$/);
    return match?.[1] ? `#${match[1]}` : "";
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">GitHub Bug Cop Tasks</h1>
        <p className="text-muted-foreground mt-2">
          Tracking bug-cop-labeled issues and pull requests across Comfy repositories
        </p>
      </div>

      {/* <div className="mb-6">
        <GithubBugcopTaskMetaEditor />
      </div> */}

      <div className="rounded-md border">
        <Table>
          <TableCaption>
            {tasks.length === 0
              ? "No bug cop tasks found"
              : `A list of ${tasks.length} bug cop task${tasks.length !== 1 ? "s" : ""} being tracked`}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="">By</TableHead>
              <TableHead className="">Title</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Status_at</TableHead>
              <TableHead className="text-center">Labels</TableHead>
              <TableHead className="text-center">Last Checked</TableHead>

              {/* <TableHead className="w-20">Actions</TableHead> */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No bug cop tasks found. Tasks will appear here as they are processed.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task: any) => (
                <TableRow key={task.url}>
                  <TableCell>
                    <Link
                      className="text-sm text-muted-foreground outline outline-[1px] rounded-full px-2 py-1 whitespace-pre"
                      href={`https://github.com/${task.user}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @{task.user}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={task.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline text-sm flex items-center gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge className="w-16 text-center justify-center">
                          {({ pull_request: "PR", issue: "Issue" } as any)[task.type] || "Task"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {getIssueNumber(task.url)}
                        </span>
                        <h3>{task.title}</h3>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={"outline"}>{task.status?.toUpperCase() || "?"}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {formatDate(task.updatedAt)}
                  </TableCell>
                  <TableCell className="text-center">
                    {task.labels && task.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {task.labels.map((label: string, index: number) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {formatDate(task.lastChecked)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 text-sm text-muted-foreground">
        <p>
          {
            'This table shows all GitHub issues and pull requests with the "Bug Cop" label that have been processed by the automated tracking system. The system monitors repositories, sends Slack notifications, and requests reviews for bug-cop-related items.'
          }
        </p>
      </div>
    </div>
  );
}
