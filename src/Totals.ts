import { analyzeTotals } from "./analyzeTotals";
import { db } from "./db";
import { type AwaitedReturnType } from "./types/AwaitedReturnType";
import { type Task } from "./utils/Task";
export type Totals = AwaitedReturnType<typeof analyzeTotals>;
export const Totals = db.collection<{
  today?: string;
  totals?: Task<Totals>;
}>("Totals");
