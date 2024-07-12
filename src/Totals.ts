import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { flatten } from "flat";
import { sf } from "snoflow";
import { type Task } from "../packages/mongodb-pipeline-ts/Task";
import { analyzeTotals } from "./analyzeTotals";
import { db } from "./db";
import { type AwaitedReturnType } from "./types/AwaitedReturnType";
export type Totals = AwaitedReturnType<typeof analyzeTotals>;
export const Totals = db.collection<{
  /** @deprecated use totals.mtime */
  today?: string;
  totals?: Task<Totals>;
}>("Totals");
if (import.meta.main) {
  sf(
    $pipeline(Totals)
      .match({ "totals.data": { $exists: true } })
      .set({ "totals.data.date": "$totals.mtime" })
      .replaceRoot({ newRoot: "$totals.data" })
      .aggregate(),
  )
    .map((e) => flatten(e) as { date: string } & Record<string, number>)
    .toLog();
}
