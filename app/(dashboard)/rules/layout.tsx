import type { ReactNode } from "react";
import { getAuthUser } from "./getAuthUser";

export default async function RulesLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  // check authorization (permission)
  const { admin } = user;
  const isAdmin = admin || user.email.endsWith("@drip.art");
  if (!isAdmin) return <div>Unauthorized</div>;

  return (
    <div className="flex flex-wrap">
      <div className="grow">{children}</div>
    </div>
  );
}
