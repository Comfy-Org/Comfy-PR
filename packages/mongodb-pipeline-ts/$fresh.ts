import enhancedMs from "enhanced-ms";

export function $staleAt(date: Date | string) {
  return { $not: { $gt: new Date(date) } };
}
export function $stale(interval: number | string) {
  const ms = typeof interval === "string" ? enhancedMs(interval) : interval;
  return { $not: { $gt: new Date(+new Date() - ms) } };
}

export function $freshAt(date: Date | string) {
  return { $gte: new Date(date) };
}
export function $fresh(interval: number | string) {
  const ms = typeof interval === "string" ? enhancedMs(interval) : interval;
  return { $gte: new Date(+new Date() - ms) };
}
