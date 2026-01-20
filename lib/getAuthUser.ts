import { auth } from "@/lib/auth";
import { db } from "@/src/db";
import type { User } from "better-auth";
import { headers as getHeaders } from "next/headers";

const Users = db.collection<{
  email: string;
  admin?: boolean;
  login?: string;
}>("users");

export type AuthUser = User & {
  admin: boolean;
  login?: string;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: await getHeaders(),
  });

  if (!session?.user) {
    return null;
  }

  const email = session.user.email;
  if (!email) {
    return null;
  }

  const dbUser = await Users.findOne({ email });

  const user: AuthUser = {
    ...session.user,
    ...dbUser,
    admin: dbUser?.admin ?? false,
    login: dbUser?.login,
  };

  // TODO: move this into .env file, it's public anyway
  user.admin ||= email.endsWith("@comfy.org");
  user.admin ||= email.endsWith("@drip.art"); // legacy domain

  return user;
}
