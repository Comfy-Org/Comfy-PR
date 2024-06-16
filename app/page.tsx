"use server";
import { analyzeTotals } from "@/src/analyzeTotals";
import { dumpDashboard } from "@/src/dumpDashboard";
import { redirect, RedirectType } from "next/navigation";
import Markdown from "react-markdown";
import {rm, mkdir, cp } from 'fs/promises'
import { v4 as uuid } from "uuid";
import yaml from "yaml";
import { DownloadButton } from "./DownloadButton";
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
            <DownloadButton action={dump.bind(null, "yaml")}>Dump .YAML</DownloadButton>
            <DownloadButton action={dump.bind(null, "csv")}>Dump .CSV</DownloadButton>
          </div>
        </div>
      </div>
    </div>
  );
}

async function dump(ext = "yaml") {
  "use server";
  const id = uuid();
  console.log({ id });
  await rm("./public/downloads", { recursive: true }).catch(()=>null);
  await mkdir("./.cache", { recursive: true });
  await mkdir("./public/downloads", { recursive: true });
  // will dump to .cache/dump.yaml and .cache/dump.csv
  await dumpDashboard();
  await cp(`.cache/dump.${ext}`, `./public/downloads/${id}/dump.${ext}`);
  redirect(`./downloads/${id}/dump.${ext}`, RedirectType.replace);
  return id;
}
