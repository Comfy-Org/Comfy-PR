import type { Task } from "@/packages/mongodb-pipeline-ts/Task";
import { gh } from "./gh";
import type { AwaitedReturnType } from "./types/AwaitedReturnType";

export const ghUser = (await gh.users.getAuthenticated()).data;

console.log("Fetch Current Github User...");
console.log(`Current Github User: ${ghUser.login} <${ghUser.email}>`);
export type GHUser = Task<AwaitedReturnType<typeof gh.users.getByUsername>["data"]>;
