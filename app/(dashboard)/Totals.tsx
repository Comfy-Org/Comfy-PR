import { analyzeTotals } from "@/src/analyzeTotals";
import Markdown from "react-markdown";
import yaml from "yaml";

export async function Totals() {
  const totals = await analyzeTotals();
  return (
    <div className="flex flex-col h-full card-body gap-4">
      <h2 className="text-5xl">Comfy-PR Totals</h2>
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
