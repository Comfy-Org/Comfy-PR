import type { CRPull } from "./CNRepos";
import { db } from "./db";

export const CRPulls = db.collection<CRPull>("CRPulls");
