import { type Task } from "@/packages/mongodb-pipeline-ts/Task";
import console from "console";
import { db } from "./db";
import { gh } from "./gh";
import type { AwaitedReturnType } from "./types/AwaitedReturnType";
import { updateAuthors } from "./updateAuthors";
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

export const Authors = db.collection<Author>("Authors");
export const GithubUsers = db.collection<
  { username: string } & Task<AwaitedReturnType<typeof gh.users.getByUsername>["data"]>
>("GithubUsers");

if (import.meta.main) {
  // collect github id from cn repos
  await updateAuthors();
  console.log("done");
}

