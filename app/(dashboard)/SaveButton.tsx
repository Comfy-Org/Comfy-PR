"use client";
import { saveAs } from "file-saver";
import type { PropsWithChildren, ReactNode } from "react";

export function SaveButton({
  children,
  content,
  filename,
  ...props
}: {
  children: ReactNode;
  content: string;
  filename: string;
} & PropsWithChildren<
  React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>
>) {
  return (
    <button
      onClick={async () => {
        await saveAs(new Blob([content]), filename);
      }}
      {...props}
    >
      {children}
    </button>
  );
}
