/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default function ComponentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-h-screen flex bg-cyan-800 card-body text-white gap-8">
      <header>
        <h1 className="text-5xl">Comfy-PR</h1>
      </header>
      <div className="shadow-xl bg-cyan-900 text-white w-full card">{children}</div>
    </div>
  );
}
