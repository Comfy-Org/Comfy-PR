import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { CNRepos } from "@/src/CNRepos";
import { Suspense } from "react";
import { CNReposTableClient } from "./CNReposTableClient";

interface CNReposPageProps {
  searchParams?: Promise<{
    page?: string;
  }>;
}

export default async function CNReposPage({ searchParams }: CNReposPageProps) {
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams?.page) || 1;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Custom Node Repositories</h1>
        <p className="text-muted-foreground">
          Manage and monitor ComfyUI custom node repositories and their registry integration status.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">✅</span>
              <span className="text-sm">Registry + ComfyUI-Manager</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">✔️</span>
              <span className="text-sm">Registry only</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🧪</span>
              <span className="text-sm">Ready to Create PR</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">👀</span>
              <span className="text-sm">Pending Review</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🫗</span>
              <span className="text-sm">Outside ComfyUI-Manager</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">❗</span>
              <span className="text-sm">Error occurred</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repositories</CardTitle>
          <CardDescription>Recent repositories and their integration status</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={<div className="flex justify-center p-8">⏳ Loading repositories...</div>}
          >
            <CNReposTable page={page} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function CNReposTable({ page }: { page: number }) {
  const pageSize = 60;
  const skip = (page - 1) * pageSize;

  const [repos, totalCount] = await Promise.all([
    CNRepos.find({}).sort({ _id: -1 }).skip(skip).limit(pageSize).toArray(),
    CNRepos.countDocuments({}),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  if (!repos.length) {
    return <div className="text-center p-8">No repositories found</div>;
  }

  return (
    <div className="space-y-4">
      <CNReposTableClient repos={repos} />
      {totalPages > 1 && <CNReposPagination currentPage={page} totalPages={totalPages} />}
    </div>
  );
}

function CNReposPagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  const maxVisiblePages = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  const createPageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", page.toString());
    return `/cnrepos${params.toString() ? "?" + params.toString() : ""}`;
  };

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </div>

      <Pagination>
        <PaginationContent>
          {currentPage > 1 && (
            <PaginationItem>
              <PaginationPrevious href={createPageUrl(currentPage - 1)} />
            </PaginationItem>
          )}

          {startPage > 1 && (
            <>
              <PaginationItem>
                <PaginationLink href={createPageUrl(1)}>1</PaginationLink>
              </PaginationItem>
              {startPage > 2 && <PaginationItem>...</PaginationItem>}
            </>
          )}

          {Array.from({ length: endPage - startPage + 1 }, (_, i) => {
            const page = startPage + i;
            return (
              <PaginationItem key={page}>
                <PaginationLink href={createPageUrl(page)} isActive={page === currentPage}>
                  {page}
                </PaginationLink>
              </PaginationItem>
            );
          })}

          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <PaginationItem>...</PaginationItem>}
              <PaginationItem>
                <PaginationLink href={createPageUrl(totalPages)}>{totalPages}</PaginationLink>
              </PaginationItem>
            </>
          )}

          {currentPage < totalPages && (
            <PaginationItem>
              <PaginationNext href={createPageUrl(currentPage + 1)} />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    </div>
  );
}
