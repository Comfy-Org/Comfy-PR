import DIE from "@snomiao/die";
import { ghUser } from "./ghUser";

export const FORK_OWNER = process.env.FORK_OWNER?.replace(/"/g, "")?.trim() || ghUser.login || DIE("Missing env.FORK_OWNER");
