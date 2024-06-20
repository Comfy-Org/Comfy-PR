import { type Task } from "../packages/mongodb-pipeline-ts/Task";
import { analyzeTotals } from "./analyzeTotals";
import { db } from "./db";
import { type AwaitedReturnType } from "./types/AwaitedReturnType";
export type Totals = AwaitedReturnType<typeof analyzeTotals>;
export const Totals = db.collection<{
  today?: string;
  totals?: Task<Totals>;
}>("Totals");
