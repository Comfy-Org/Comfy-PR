import Link from "next/link";
import DetailsTable from "./Details";
import { Totals } from "./Totals";
export const dynamic = "force-dynamic";

export default async function CRPullsDump() {
  return (
    <main className="flex">
      <Totals />
      <div className="h-full card-body justify-center gap-4">
        <div className="h-[48px] flex">
          <h3 className="self-end">Details</h3>
        </div>
        <div className="card gap-8">
          <div className="flex gap-4">
            {/* two super big buttons: 1. dump yaml, 2. dump csv */}
            <Link className="btn" href="/api/dump.csv" target="dump">
              Dump .CSV
            </Link>
            <Link className="btn" href="/api/dump.yaml" target="dump">
              Dump .YAML
            </Link>
          </div>

          <DetailsTable limit={40} />
        </div>
      </div>
    </main>
  );
}
