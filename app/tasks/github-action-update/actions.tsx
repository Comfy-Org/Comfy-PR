"use server";
import { getAuthUser } from "@/lib/getAuthUser";
import { GithubActionUpdateTask } from "@/src/GithubActionUpdateTask/GithubActionUpdateTask";
import { z } from "zod";

export async function resetGithubActionUpdateTaskAction(
  prevState: { ok: boolean },
  formData: FormData,
) {
  "use server";
  await getAuthUser();
  const e = z.object({ repo: z.string() }).parse(Object.fromEntries(formData.entries()));
  await resetErrorForGithubActionUpdateTask(e.repo);
  return { ok: true };
}
export async function approveGithubActionUpdateTaskAction(
  prevState: { ok: boolean },
  formData: FormData,
) {
  "use server";
  await getAuthUser();
  const e = z
    .object({
      repo: z.string(),
      branchVersionHash: z.string(),
    })
    .parse(Object.fromEntries(formData.entries()));
  await approveGithubActionUpdateTask(e.repo, e.branchVersionHash);
  return { ok: true };
}
export async function approveGithubActionUpdateTask(repo: string, approvedHash: string) {
  // "use server";
  // await getAuthUser();
  await GithubActionUpdateTask.findOneAndUpdate(
    { repo },
    { $set: { approvedBranchVersionHash: approvedHash, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
}
export async function resetErrorForGithubActionUpdateTask(repo: string) {
  await GithubActionUpdateTask.findOneAndDelete({ repo });
  await GithubActionUpdateTask.findOneAndUpdate(
    { repo },
    { $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
}
export async function listGithubActionUpdateTask() {
  console.log("listGithubActionUpdateTask");
  return (await GithubActionUpdateTask.find({}).toArray()).map(({ _id, ...e }) => ({
    ...e,
    updatedAt: +(e.updatedAt ?? 0),
  }));
}
