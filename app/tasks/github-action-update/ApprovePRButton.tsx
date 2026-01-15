"use client";
import "is-hotkey-esm";
import { isHotkey } from "is-hotkey-esm";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { approveGithubActionUpdateTaskAction } from "./actions";
export function ApprovePRButton(e: { repo: string; branchVersionHash?: string }) {
  const [state, formAction, pending] = useActionState(approveGithubActionUpdateTaskAction, {
    ok: false,
  });
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="repo" value={e.repo} />
      <input type="hidden" name="branchVersionHash" value={e.branchVersionHash} />
      <button
        disabled={pending || !!state.ok}
        aria-busy={pending}
        className="btn btn-approve"
        title="will perform on next run"
        onKeyDown={(e) => {
          const mv = (offset: number) => {
            const btns = [
              ...document.querySelectorAll("button.btn-approve"),
            ] as HTMLButtonElement[];
            btns[btns.indexOf(e.currentTarget) + offset]?.scrollIntoView({ block: "start" });
            btns[btns.indexOf(e.currentTarget) + offset]?.focus();

            (e.stopPropagation(), e.preventDefault());
          };
          if (isHotkey("ArrowUp")(e)) mv(-1);
          if (isHotkey("ArrowDown")(e)) mv(1);
        }}
        onClick={(e) => {
          const mv = (offset: number) => {
            const btns = [
              ...document.querySelectorAll("button.btn-approve"),
            ] as HTMLButtonElement[];
            btns[btns.indexOf(e.currentTarget) + offset]?.scrollIntoView({ block: "start" });
            btns[btns.indexOf(e.currentTarget) + offset]?.focus();
          };
          // move focus to next button
          mv(1);
        }}
      >
        {!state.ok ? <>Approve for Creating PR</> : <>APPROVED</>}
      </button>
    </form>
  );
}
