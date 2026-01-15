"use client";
export function DownloadButton({
  children,
  action,
}: {
  children: React.ReactNode;
  action: () => void;
}) {
  return (
    <button className="btn" onClick={() => action()}>
      <>{children}</>
    </button>
  );
}
