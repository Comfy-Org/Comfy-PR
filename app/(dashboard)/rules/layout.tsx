import type { ReactNode } from "react";
export default async function RulesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap">
      <div className="grow">{children}</div>
    </div>
  );
}
