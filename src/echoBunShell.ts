import { $ as bunSh, ShellPromise, type ShellExpression } from "bun";
/**
 * @example
 * await $`echo 1 || echo 2\necho 3`
 * // Outputs:
 * // $ echo 1 || echo 2
 * // > echo 3
 * // 1
 * // 3
 */
export function $(
  strings: TemplateStringsArray,
  ...expressions: ShellExpression[]
): ShellPromise {
  console.log(
    strings
      .map((s, i) => s + (expressions[i] ?? ""))
      .join("")
      .trim()
      .split("\n")
      .map((e, i) => (i === 0 ? "$ " : "> ") + e)
      .join("\n")
  );
  return bunSh(strings, ...expressions);
}
