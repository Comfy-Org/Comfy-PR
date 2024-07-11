import { db } from "@/src/db";
import { snoflow } from "snoflow";

export const Users = db.collection<{
  email: string;
  admin: boolean;
}>("Users");

// setup admins
await snoflow(process.env.AUTH_ADMINS?.split(",") ?? [])
  .pMap((email) => Users.updateOne({ email }, { $set: { email, admin: true } }, { upsert: true }))
  .toCount();
