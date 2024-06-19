"use server";
import { analyzePullsStatus } from "@/src/analyzePullsStatus";
import { PullsStatusTable } from "./PullsStatusTable";

/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function DetailsTable({ skip = 0, limit = 0 }) {
  "use server";
  const pullsStatus = await analyzePullsStatus({ skip, limit });
  return <PullsStatusTable {...{ pullsStatus }} />;
}
