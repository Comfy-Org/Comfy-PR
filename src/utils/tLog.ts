import prettyMs from "pretty-ms";
import { type Awaitable } from "../types/Awaitable";
export async function tLog<T>(msg: string, fn: () => Awaitable<T[]>) {
  const s = +Date.now();
  const r = await fn();
  const e = +Date.now();
  console.log(`[${prettyMs(e - s)}] ${msg} done (count: ${r.length})`);
  return r;
}
