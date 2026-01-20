import { getAuthUser } from "@/lib/getAuthUser";
import { forbidden } from "next/navigation";
import type { ReactNode } from "react";

export default async function RulesLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  const isAdmin = user?.admin;
  if (!isAdmin) return forbidden();

  return (
    <div className="flex flex-wrap">
      <div className="grow">{children}</div>
    </div>
  );
}
