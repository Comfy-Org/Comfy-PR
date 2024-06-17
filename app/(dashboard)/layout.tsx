/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default function ComponentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-h-screen flex bg-cyan-800">
      <div className="shadow-xl bg-cyan-900 text-white w-full">{children}</div>
    </div>
  );
}
