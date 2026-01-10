// import { analyzePullsStatus } from "@/src/analyzePullsStatus";
import { csvFormat } from "d3";
import { notFound } from "next/navigation";
import yaml from "yaml";

export const GET = async (req: Request) => {
  const { analyzePullsStatus } = await import("@/src/analyzePullsStatus");
  const ext = req.url.split(".").pop();
  if (ext === "csv")
    return new Response(csvFormat(await analyzePullsStatus()), {
      headers: { "Content-Type": "text/csv" },
    });
  if (ext === "yaml")
    return new Response(yaml.stringify(await analyzePullsStatus()), {
      headers: { "Content-Type": "text/yaml" },
    });
  notFound();
};
