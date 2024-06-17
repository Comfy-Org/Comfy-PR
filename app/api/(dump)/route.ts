import { analyzeCRPullsDetails } from "@/src/analyzeCRPullsDetails";
import { csvFormat } from "d3";
import { notFound } from "next/navigation";
import yaml from "yaml";

export const GET = async (req: Request) => {
  const ext = [...req.url.split(".")].pop();
  if (ext === "csv")
    return new Response(csvFormat(await analyzeCRPullsDetails()), { headers: { "Content-Type": "text/csv" } });
  if (ext === "yaml")
    return new Response(yaml.stringify(await analyzeCRPullsDetails()), { headers: { "Content-Type": "text/yaml" } });
  notFound();
};
