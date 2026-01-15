import { $OK, TaskDataOrNull, TaskError, TaskOK } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import console from "console";
import { peekYaml } from "peek-log";
import { sflow } from "sflow";
import { Authors, GithubUsers } from "./Authors";
import { $stale } from "./db";
import { gh } from "@/lib/github";

if (import.meta.main) {
  await updateAuthorsForGithub();
}
export async function updateAuthorsForGithub() {
  await sflow(Authors.find({ githubMtime: $stale("7d") }))
    .map((e) => e.githubId)
    .filter()
    .pMap(
      async (username) => {
        const cached = await GithubUsers.findOne({ username, mtime: $stale("1d"), ...$OK });
        if (cached) return cached;
        console.log("Fetching github user " + username);
        const result = await gh.users
          .getByUsername({ username })
          .then((e) => e.data)
          .then(TaskOK)
          .catch(TaskError);
        return (
          (await GithubUsers.findOneAndUpdate(
            { username },
            { $set: result },
            { returnDocument: "after", upsert: true },
          )) ?? DIE(`fail to udpate gh users`)
        );
      },
      { concurrency: 2 },
    )
    .map((e) => TaskDataOrNull(e))
    .filter()
    .map(({ email, avatar_url, blog, updated_at, location, company, hireable, bio, login }) =>
      Authors.findOneAndUpdate(
        { githubId: login },
        {
          $set: {
            githubMtime: new Date(),
            ...(email && { email }),
            ...(null != hireable && { hireable }),
          },
          $addToSet: {
            ...(bio && { bios: bio }),
            avatars: avatar_url,
            ...(location && { locations: location }),
            ...(blog && { blogs: blog }),
            ...(company && { companies: company }),
          },
        },
        { upsert: true, returnDocument: "after" },
      ),
    )
    .forEach(peekYaml)
    .done();
}
