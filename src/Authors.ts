import { db } from "./db";
import type { GHUser } from "./ghUser";
import { updateAuthors } from "./updateAuthors";
export type Author = {
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
await Authors.createIndex("githubId");
await Authors.createIndex("email");
export const GithubUsers = db.collection<{ username: string } & GHUser>("GithubUsers");

if (import.meta.main) {
  // collect github id from cn repos
  await updateAuthors();
  console.log("done");
}
