'use client'
import { saveAs } from "file-saver";
import type { ReactNode } from "react";

export function SaveButton({
  children,
  content,
  filename,
}: {
  children: ReactNode;
  content: string;
  filename: string;
}) {
  return (
    <button
      onClick={async () => {
        await saveAs(content, filename);
      }}
    >
      {children}
    </button>
  );
}
