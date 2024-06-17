import { dumpDashboard } from "@/src/dumpDashboard";
import { csvFormat } from "d3";
import { notFound } from "next/navigation";
import yaml from "yaml";

export const GET = async (req: Request) => {
  const ext = [...req.url.split(".")].pop();
  if (ext === "csv") return new Response(csvFormat(await dumpDashboard()), { headers: { "Content-Type": "text/csv" } });
  if (ext === "yaml")
    return new Response(yaml.stringify(await dumpDashboard()), { headers: { "Content-Type": "text/yaml" } });
  notFound();
};
