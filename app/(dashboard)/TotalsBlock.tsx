"use server";
import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { Totals } from "@/src/Totals";
import { updateComfyTotals } from "@/src/updateComfyTotals";
import { yaml } from "@/src/utils/yaml";
import { flatten } from "flat";
import Markdown from "react-markdown";
import { sf } from "snoflow";
import { TotalsChart } from "./TotalsChart";

function getTotalsData() {
  return sf(
    $pipeline(Totals)
      .match({ "totals.data": { $exists: true } })
      .set({ "totals.data.date": "$totals.mtime" })
      .replaceRoot({ newRoot: "$totals.data" })
      .aggregate(),
  )
    .map((e) => flatten(e) as { date: string } & Record<string, number>)
    .toArray();
}

export async function TotalsBlock() {
  "use server";
  const [totals] = await updateComfyTotals({ notify: false, fresh: "30s" });

  return (
    <div className="flex flex-col h-full card-body gap-4 shrink-0 grow-0">
      <h2 className="text-2xl">Totals</h2>
      <div className="">
        <Markdown>
          {`
${"```yaml"}
${yaml.stringify(totals)}
${"```"}
`}
        </Markdown>
      </div>
    </div>
  );
}

export async function TotalsChartBlock() {
  "use server";
  const totalsData = await getTotalsData();

  return (
    <div className="flex flex-col h-full card-body gap-4 shrink-0 grow-0">
      <h2 className="text-2xl">Totals Chart</h2>
      <div className="">
        <TotalsChart {...{ totalsData }} />
      </div>
    </div>
  );
}
