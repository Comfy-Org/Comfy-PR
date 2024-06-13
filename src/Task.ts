
export type Task<T> = { mtime: Date } & (
  | { state: "pending"; data?: T }
  | { state: "ok"; data: T }
  | { state: "error"; error: string }
);

export const $PENDING = {state: "pending" } as const
export function TaskPending<T>(data?: T) {
  return {
    state: "pending" as const,
    mtime: new Date(),
    data,
  };
}

export const $OK = {state: "ok" } as const
export function TaskOK<T>(data: T) {
  return {
    state: "ok" as const,
    mtime: new Date(),
    data,
  };
}

export const $ERROR = {state: "error" } as const
export function TaskError(error: any) {
  return {
    state: "error" as const,
    mtime: new Date(),
    error: String(error.message ?? error),
  };
}
