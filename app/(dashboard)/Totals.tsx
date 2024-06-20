"use server";
import { updateComfyTotals } from "@/src/updateComfyTotals";
import Markdown from "react-markdown";
import yaml from "yaml";

export async function Totals() {
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
