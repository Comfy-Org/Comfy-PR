import Link from "next/link";
import { Suspense } from "react";
import DetailsTable from "./DetailsTable";
import TotalsPage from "./totals/page";

// Force dynamic rendering to avoid build-time database access
export const dynamic = "force-dynamic";
export const revalidate = 60; // seconds

export default async function DashboardPage() {
  return (
    <main className="flex flex-wrap">
      <TotalsPage />
      <LatestDetails />
    </main>
  );
}
async function LatestDetails() {
  return (
    <div className="h-full card-body justify-center gap-4 min-w-0 overflow-hidden grow-1">
      <div className="text-2xl flex justify-between">
        <h2 className="">Latest</h2>
        <div className="flex gap-4">
          <Link className="btn" href="/api/dump.csv" target="dump">
            Dump .CSV
          </Link>
          <Link className="btn" href="/api/dump.yaml" target="dump">
            Dump .YAML
          </Link>
        </div>
      </div>
      <div className="flex-col flex gap-8">
        <div className="card overflow-hidden">
          <Suspense>
            <DetailsTable limit={20} />
          </Suspense>
        </div>
        <Link href="/details" className="p-4 btn btn-ghost">
          See More?
        </Link>
      </div>
    </div>
  );
}
