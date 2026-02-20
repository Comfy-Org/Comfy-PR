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
import { GithubDesignTaskMetaEditor } from "./GithubDesignTaskMetaEditor";

// Force dynamic rendering to avoid build-time database access
export const dynamic = "force-dynamic";

/**
 * GitHub Design Task Dashboard
 * Displays all design-labeled issues and PRs being tracked
 */
export default async function GithubDesignTaskPage() {
  // Dynamically import to ensure indexes are created at runtime
  const { GithubDesignTask } = await import("./gh-design");

  // Fetch all tasks from the database
  const tasks = await GithubDesignTask.find({}).sort({ lastCheckedAt: -1 }).toArray();

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

  const _getRepoFromUrl = (url: string) => {
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
    return match?.[1] || url;
  };

  const getIssueNumber = (url: string) => {
    const match = url.match(/\/(\d+)$/);
    return match?.[1] ? `#${match[1]}` : "";
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">GitHub Design Tasks</h1>
        <p className="text-muted-foreground mt-2">
          Tracking design-labeled issues and pull requests across Comfy repositories
        </p>
      </div>

      <div className="mb-6">
        <GithubDesignTaskMetaEditor />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableCaption>
            {tasks.length === 0
              ? "No design tasks found"
              : `A list of ${tasks.length} design task${tasks.length !== 1 ? "s" : ""} being tracked`}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="">By</TableHead>
              <TableHead className="">Title</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Status_at</TableHead>
              <TableHead className="text-center">Labels</TableHead>
              <TableHead className="text-center">Reviewers</TableHead>
              <TableHead className="text-center">Slack</TableHead>

              {/* <TableHead className="w-20">Actions</TableHead> */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No design tasks found. Tasks will appear here as they are processed.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
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
                          {{ pull_request: "PR", issue: "Issue" }[task.type] || "Task"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {getIssueNumber(task.url)}
                        </span>
                        <h3>{task.title}</h3>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={"outline"}>{task.state?.toUpperCase() || "?"}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {formatDate(task.stateAt)}
                  </TableCell>
                  <TableCell className="text-center">
                    {task.labels && task.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {task.labels.map((label, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs"
                            style={{ backgroundColor: `#${label.color}` }}
                          >
                            {label.name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center">
                    {task.reviewers && task.reviewers.length > 0 ? (
                      <div className=" flex flex-wrap gap-1">
                        {task.reviewers.map((reviewer, index) => (
                          <Link
                            key={index}
                            className="text-sm text-muted-foreground outline outline-[1px] rounded-full px-2 py-1"
                            href={`https://github.com/${reviewer}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            @{reviewer}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center">
                    {task.slackUrl ? (
                      <Link
                        href={task.slackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground outline outline-[1px] rounded-full px-2 py-1"
                      >
                        View
                      </Link>
                    ) : null}
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
            'This table shows all GitHub issues and pull requests with the "Design" label that have been processed by the automated tracking system. The system monitors repositories, sends Slack notifications, and requests reviews for design-related items.'
          }
        </p>
      </div>
    </div>
  );
}
