import prettyMs from "pretty-ms";
import { type Awaitable } from "../types/Awaitable";
export async function tLog<T, F extends () => Awaitable<T>>(fn: F): Promise<T>;
export async function tLog<T, F extends () => Awaitable<T[]>>(fn: F): Promise<T[]>;
export async function tLog<T>(msg: string, fn: () => Awaitable<T[]>): Promise<T[]>;
export async function tLog<T>(msg: string, fn: () => Awaitable<T>): Promise<T>;
export async function tLog<T, F extends () => Awaitable<T[]>>(arg1: string | F, fn?: F): Promise<T[]> {
  const _fn = typeof arg1 === "string" ? fn : arg1;
  const msg = typeof arg1 === "string" ? arg1 : (fn?.name ?? "tLog");
  const s = +Date.now();
  const r = await _fn!();
  const e = +Date.now();
  const strCount = (r && `(count: ${r.length ?? "N/A"})`) || "";
  console.log(`[${prettyMs(e - s)}] ${msg} done ${strCount}`.trim());
  return r;
}
export { prettyMs };
