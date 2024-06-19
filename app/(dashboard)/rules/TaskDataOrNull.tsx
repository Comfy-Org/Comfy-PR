import { type Task, $OK } from "@/src/utils/Task";
import { tsmatch } from "@/src/utils/tsmatch";

export function TaskDataOrNull<T>(e?: Task<T>) {
  return tsmatch(e)
    .with($OK, ({ data }) => data)
    .otherwise(() => null);
}
