"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaskDataOrNull, TaskErrorOrNull } from "@/packages/mongodb-pipeline-ts/Task";
import type { CNRepo } from "@/src/CNRepos";
import { Info } from "lucide-react";
import { useState } from "react";
import yaml from "yaml";

interface CNReposTableClientProps {
  repos: Array<CNRepo & { _id?: unknown }>;
}

export function CNReposTableClient({ repos }: CNReposTableClientProps) {
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow className="h-8">
          <TableHead className="w-12 px-2 py-1">Status</TableHead>
          <TableHead className="px-2 py-1">Repository</TableHead>
          <TableHead className="w-20 text-center px-2 py-1">Registry</TableHead>
          <TableHead className="w-28 text-center px-2 py-1">ComfyUI-Manager</TableHead>
          <TableHead className="w-20 text-center px-2 py-1">Candidate</TableHead>
          <TableHead className="px-2 py-1">Pull Requests</TableHead>
          <TableHead className="w-20 px-2 py-1">Info</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {repos.map((repo) => (
          <CNRepoRow key={repo._id?.toString()} repo={repo} />
        ))}
      </TableBody>
    </Table>
  );
}

function CNRepoRow({ repo }: { repo: CNRepo & { _id?: unknown } }) {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusIcon = () => {
    if (!repo.cr && !repo.cm) return "🫗";
    if (!!repo.cr && !!repo.cm && repo.crPulls?.state === "ok") return "✅";
    if (!!repo.cr && !!repo.cm) return "☑️";
    if (!!repo.cr && !repo.cm) return "✔️";
    if (!repo.crPulls) return "🧪";
    if (repo.crPulls.state === "ok") return "👀";
    if (TaskErrorOrNull(repo.crPulls)) return "❗";
    return "❓";
  };

  const getStatusDescription = () => {
    const icon = getStatusIcon();
    const descriptions = {
      "🫗": "Repository not listed in ComfyUI-Manager or Registry",
      "✅": "Listed in both Registry and ComfyUI-Manager (PR successful)",
      "☑️": "Listed in both Registry and ComfyUI-Manager",
      "✔️": "Listed in Registry only",
      "🧪": "Ready to create PR",
      "👀": "Pull request pending review",
      "❗": "Error occurred during processing",
      "❓": "Unknown status",
    };
    return descriptions[icon as keyof typeof descriptions] || "Unknown status";
  };

  const getRepoName = (url: string) => {
    return url.replace(/^https:\/\/github\.com\//, "");
  };

  return (
    <TableRow className="h-10">
      <TableCell className="text-center text-base px-2 py-1" title={getStatusDescription()}>
        {getStatusIcon()}
      </TableCell>
      <TableCell className="px-2 py-1">
        <a
          href={repo.repository}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline font-mono text-xs transition-colors"
        >
          {getRepoName(repo.repository)}
        </a>
      </TableCell>
      <TableCell className="text-center px-2 py-1">
        {repo.cr_ids?.length || repo.cr ? (
          <Badge variant="secondary" className="text-xs px-1 py-0">
            ✓
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-center px-2 py-1">
        {repo.cm_ids?.length || repo.cm ? (
          <Badge variant="secondary" className="text-xs px-1 py-0">
            ✓
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-center px-2 py-1">
        {TaskDataOrNull(repo.candidate) ? (
          <Badge variant="outline" className="text-xs px-1 py-0">
            ✓
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="px-2 py-1">
        <div className="space-y-0.5">
          {TaskDataOrNull(repo.crPulls)?.map((pull, idx) => (
            <div key={idx} className="text-xs">
              {pull.pull?.html_url ? (
                <a
                  href={pull.pull.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline transition-colors"
                >
                  #{pull.pull.html_url.split("/").pop()} ({pull.type})
                </a>
              ) : (
                <span className="text-muted-foreground">Pending</span>
              )}
            </div>
          ))}
          {TaskErrorOrNull(repo.crPulls) && (
            <Badge
              variant="destructive"
              className="text-xs"
              title={TaskErrorOrNull(repo.crPulls) || ""}
            >
              Error
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="px-2 py-1">
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <Info className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">
                {getRepoName(repo.repository)}
              </DialogTitle>
              <DialogDescription>Repository details and metadata</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto font-mono">
                {yaml.stringify({
                  repository: repo.repository,
                  status: getStatusDescription(),
                  cr_ids: repo.cr_ids?.length || 0,
                  cm_ids: repo.cm_ids?.length || 0,
                  candidate: TaskDataOrNull(repo.candidate),
                  info: TaskDataOrNull(repo.info)
                    ? {
                        archived: TaskDataOrNull(repo.info)?.archived,
                        private: TaskDataOrNull(repo.info)?.private,
                        default_branch: TaskDataOrNull(repo.info)?.default_branch,
                        html_url: TaskDataOrNull(repo.info)?.html_url,
                      }
                    : null,
                  pulls_count: TaskDataOrNull(repo.pulls)?.length || 0,
                  crPulls: TaskDataOrNull(repo.crPulls)?.map((pull) => ({
                    type: pull.type,
                    url: pull.pull?.html_url,
                    state: pull.pull?.prState,
                  })),
                  crPulls_state: repo.crPulls?.state,
                  error: TaskErrorOrNull(repo.crPulls),
                })}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
