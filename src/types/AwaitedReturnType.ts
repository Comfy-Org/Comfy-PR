import { type AnyFunction } from "rambda";

export type AwaitedReturnType<T extends AnyFunction> = Awaited<ReturnType<T>>;
