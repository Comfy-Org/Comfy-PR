"use server";
import { analyzeTotals } from "@/src/analyzeTotals";
import Link from "next/link";
import Markdown from "react-markdown";
import yaml from "yaml";
export default async function CRPullsDump() {
  const totals = await analyzeTotals();
  return (
    <div className="w-screen h-screen flex justify-center items-center bg-cyan-800">
      <div className="flex flex-row gap-4 justify-around shadow-xl bg-blue-900 text-white w-full">
        <div className="flex flex-col h-full card-body gap-4">
          <h2 className="text-5xl">Totals</h2>
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
        <div className="flex flex-col h-full card-body justify-center gap-4">
          <div className="h-[48px] flex">
            <h3 className="self-end">Dump Details</h3>
          </div>
          <div className="flex gap-4">
            {/* two super big buttons: 1. dump yaml, 2. dump csv */}
            <Link className="btn" href="/api/dump.yaml" target="dump">
              Dump .YAML
            </Link>
            <Link className="btn" href="/api/dump.csv" target="dump">
              Dump .CSV
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// async function dump(ext = "yaml") {
//   "use server";
//   const id = uuid();
//   console.log({ id });
//   await rm("./public/downloads", { recursive: true }).catch(() => null);
//   await mkdir("./.cache", { recursive: true });
//   await mkdir("./public/downloads", { recursive: true });
//   // will dump to .cache/dump.yaml and .cache/dump.csv
//   const r = await dumpDashboard();
//   await cp(`.cache/dump.${ext}`, `./public/downloads/${id}/dump.${ext}`);
//   redirect(`./downloads/${id}/dump.${ext}`, RedirectType.replace);
//   return id;
// }
