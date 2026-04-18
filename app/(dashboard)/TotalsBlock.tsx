"use server";
import { updateComfyTotals } from "@/src/updateComfyTotals";
import { yaml } from "@/src/utils/yaml";
import Markdown from "react-markdown";
import { TotalsChart } from "./TotalsChartLazy";
import { getTotalsData } from "./getTotalsData";

export async function TotalsBlock() {
  "use server";
  const [totals] = await updateComfyTotals({ notify: false, fresh: "5m" });

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
