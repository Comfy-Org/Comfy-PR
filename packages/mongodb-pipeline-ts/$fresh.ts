import enhancedMs from "enhanced-ms";

type $before = { $lt: Date };
type $after = { $gt: Date };
type $stale = { $not: { $gt: Date } };
type $fresh = { $gte: Date };
export function $stale(at: Date): $stale;
export function $stale(interval: number): $stale;
export function $stale(duration: string): $stale;
export function $stale(x: Date | number | string) {
  if (typeof x === "string") return $stale(enhancedMs(x));
  if (typeof x === "number") return $stale(new Date(+new Date() - x));
  return { $not: { $gt: x } };
}
export function $fresh(at: Date): $fresh;
export function $fresh(interval: number): $fresh;
export function $fresh(duration: string): $fresh;
export function $fresh(x: Date | number | string) {
  if (typeof x === "string") return $fresh(enhancedMs(x));
  if (typeof x === "number") return $fresh(new Date(+new Date() - x));
  return { $gte: x };
}

export function $before(at: Date): $before;
export function $before(interval: number): $before;
export function $before(duration: string): $before;
export function $before(x: Date | string | number) {
  if (typeof x === "string") return $before(enhancedMs(x));
  if (typeof x === "number") return $before(new Date(x));
  return { $lt: x };
}

export function $after(at: Date): $after;
export function $after(interval: number): $after;
export function $after(duration: string): $after;
export function $after(x: Date | string | number) {
  if (typeof x === "string") return $after(enhancedMs(x));
  if (typeof x === "number") return $after(new Date(x));
  return { $gt: x };
}
