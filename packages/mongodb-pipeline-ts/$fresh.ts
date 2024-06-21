import enhancedMs from "enhanced-ms";

/** match stale and not existed data */
export const $stale: {
  (at: Date): { $not: { $gt: Date } };
  (interval: number): { $not: { $gt: Date } };
  (duration: string): { $not: { $gt: Date } };
  (x: Date | number | string): { $not: { $gt: Date } };
} = (x) => {
  if (typeof x === "string") return $stale(enhancedMs(x));
  if (typeof x === "number") return $stale(new Date(+new Date() - x));
  return { $not: { $gt: x } };
};
/** match fresh data  */
export const $fresh: {
  (at: Date): { $gte: Date };
  (interval: number): { $gte: Date };
  (duration: string): { $gte: Date };
  (x: Date | number | string): { $gte: Date };
} = (x) => {
  if (typeof x === "string") return $fresh(enhancedMs(x));
  if (typeof x === "number") return $fresh(new Date(+new Date() - x));
  return { $gte: x };
};

/** match data before */
export const $before: {
  (at: Date): { $lt: Date };
  (interval: number): { $lt: Date };
  /** match data duration */
  (duration: string): { $lt: Date };
  (x: Date | string | number): { $lt: Date };
} = (x) => {
  if (typeof x === "string") return $before(enhancedMs(x));
  if (typeof x === "number") return $before(new Date(+new Date() - x));
  return { $lt: x };
};

export const $after: {
  (at: Date): { $gt: Date };
  (interval: number): { $gt: Date };
  (duration: string): { $gt: Date };
  (x: Date | string | number): { $gt: Date };
} = (x) => {
  if (typeof x === "string") return $after(enhancedMs(x));
  if (typeof x === "number") return $after(new Date(+new Date() - x));
  return { $gt: x };
};
