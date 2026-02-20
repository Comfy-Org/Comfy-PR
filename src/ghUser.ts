import type { Task } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import { gh } from "@/lib/github";
import type { AwaitedReturnType } from "./types/AwaitedReturnType";

const g = globalThis as typeof globalThis & {
  ghUserCache: AwaitedReturnType<typeof gh.users.getAuthenticated>["data"] | null;
};
export const ghUser = async () =>
  (g.ghUserCache ??= (
    await gh.users.getAuthenticated().catch((error) => {
      throw new Error(
        `FAIL TO GET AUTHENTICATED USER INFO, CHECK ${process.env.GH_TOKEN ? "[?]" : "[ ]"}GH_TOKEN and ${process.env.GH_TOKEN_COMFY_PR ? "[?]" : "[ ]"}GH_TOKEN_COMFY_PR`,
        { cause: error },
      );
    })
  ).data);

// console.log(`GH_TOKEN User: ${(await ghUser()).login} <${(await ghUser()).email}>`);

export type GHUser = Task<AwaitedReturnType<typeof gh.users.getByUsername>["data"]>;

export const GIT_USEREMAIL = async () =>
  process.env.GIT_USEREMAIL ||
  ((await ghUser()).email && (await ghUser()).email) ||
  DIE("Missing env.GIT_USEREMAIL");
export const GIT_USERNAME = async () =>
  process.env.GIT_USERNAME ||
  ((await ghUser()).email && (await ghUser()).name) ||
  DIE("Missing env.GIT_USERNAME");

// read env/parameters
console.log(`GIT COMMIT USER: ${await GIT_USERNAME()} <${await GIT_USEREMAIL()}>`);
