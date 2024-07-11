import { auth, signIn } from "@/app/api/auth/[...nextauth]/auth";
import { Users } from "./Users";

export async function getAuthUser() {
  const session = await auth();
  const authUser = session?.user ?? (await signIn());
  const email = authUser.email || (await signIn());  // must have email
  const user = { ...{...authUser, email}, ...(await Users.findOne({ email })) };
  return user;
}
