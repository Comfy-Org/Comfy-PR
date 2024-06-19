import { $ERROR, type Task } from "@/src/utils/Task";
import { tsmatch } from "@/src/utils/tsmatch";

export function TaskErrorOrNull<T>(e?: Task<T>) {
  return tsmatch(e)
    .with($ERROR, ({ error }) => error)
    .otherwise(() => null);
}
