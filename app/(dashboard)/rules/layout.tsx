import type { ReactNode } from "react";

// const Users = db.collection<{
//   email: string;
//   admin: boolean;
// }>("Users");
// await pMap(process.env.AUTH_ADMINS?.split(",") ?? [], async (email) => {
//   await Users.updateOne({ email }, { $set: { email, admin: true } }, { upsert: true });
// });

export default async function RulesLayout({ children }: { children: ReactNode }) {
  // const session = await auth();
  // const email = session?.user?.email ?? (await signIn());
  // const user = (await Users.findOne({ admin: true, email })) ?? (await signIn());
  // if (!user.admin) {
  //   return <div>Unauthorized</div>;
  // }
  return (
    <div className="flex flex-wrap">
      <div className="grow">{children}</div>
    </div>
  );
}
