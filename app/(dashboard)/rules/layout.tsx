import type { ReactNode } from "react";
import { getAuthUser } from "./getAuthUser";

export default async function RulesLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  // check authorization (permission)
  const { admin } = user;
  if (!admin) return <div>Unauthorized</div>;

  return (
    <div className="flex flex-wrap">
      <div className="grow">{children}</div>
    </div>
  );
}
