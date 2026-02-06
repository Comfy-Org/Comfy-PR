import prettyMs from "pretty-ms";

export const createTimeLogger =
  (st = +new Date()) =>
  (...args: unknown[]) => {
    const depth = new Error().stack?.split("\n").length ?? 0;
    console.log(prettyMs(+new Date() - st).padStart(6, " ") + " ".repeat((depth / 2) | 0), ...args);
  };
