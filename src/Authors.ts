import { $pipeline } from "@/packages/mongodb-pipeline-ts/$pipeline";
import { $OK, TaskDataOrNull, TaskError, TaskOK, type Task } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import console from "console";
import { peekYaml } from "peek-log";
import { snoflow } from "snoflow";
import { CNRepos } from "./CNRepos";
import { $filaten, $stale, db } from "./db";
import { gh } from "./gh";
import type { AwaitedReturnType } from "./types/AwaitedReturnType";

type Author = {
  email?: string;
  // cold down
  githubMtime?: Date;
  instagramMtime?: Date;
  discordMtime?: Date;
  twitterMtime?: Date;

  // id
  githubId?: string;
  instagramId?: string;
  discordId?: string;
  twitterId?: string;

  // repos on cm and cr
  cm: number; // comfy node manager
  cr: number; // comfy registry

  // common info
  nicknames?: string[];
  bios?: string[];
  links?: string[]; // one could be url or markdown style link: [name](link)
  blogs?: string[]; // one could be url or markdown style link: [name](link)
  companies?: string[];
  locations?: string[];
  avatars?: string[];
  hireable?: boolean; // github
};

const Authors = db.collection<Author>("Authors");
const GithubUsers = db.collection<
  { username: string } & Task<AwaitedReturnType<typeof gh.users.getByUsername>["data"]>
>("GithubUsers");

if (import.meta.main) {
  // collect github id from cn repos
  await updateAuthorsFromCNRepo();
  await updateAuthorsForGithub();
  console.log("done");
}

/** Update authors for gh users, collecting emails/username/hireable */
async function updateAuthorsFromCNRepo() {
  return await snoflow(
    $pipeline(CNRepos)
      .match($filaten({ info: { data: { owner: { login: { $exists: true } } } } }))
      .group({
        _id: "$info.data.owner.login",
        // author: "$info.data.owner.login",
        cm: { $sum: { $cond: [{ $eq: [{ $type: "$cm" }, "missing"] }, 0, 1] } },
        cr: { $sum: { $cond: [{ $eq: [{ $type: "$cr" }, "missing"] }, 0, 1] } },

        // TODO: get totals open/closed/merged
        // pulls:{
        //   OPEN: {"$crPulls.data.pull.prState", "open"}
        // }
        All: { $sum: 1 },
      })
      .set({ login: "$_id" })
      .project({ _id: 0 })
      .aggregate(),
  )
    .peek(({ login, ...$set }) => Authors.updateOne({ login }, { $set }, { upsert: true }))
    .done();
}

async function updateAuthorsForGithub() {
  await snoflow(Authors.find({ githubMtime: $stale("7d") }))
    .map((e) => e.githubId)
    .filter()
    .pMap(2, async (username) => {
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
    })
    .map((e) => TaskDataOrNull(e))
    .filter()
    .map(({ email, avatar_url, blog, updated_at, location, company, hireable, bio, login }) =>
      Authors.findOneAndUpdate(
        { githubId: login },
        {
          $set: { githubMtime: new Date(), ...(email && { email }), ...(null != hireable && { hireable }) },
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
    .peek(peekYaml)
    .done();
}
