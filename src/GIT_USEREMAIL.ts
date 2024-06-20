import DIE from "@snomiao/die";
import { ghUser } from "./ghUser";

export const GIT_USEREMAIL =
  process.env.GIT_USEREMAIL || (ghUser.email && ghUser.email) || DIE("Missing env.GIT_USEREMAIL");
