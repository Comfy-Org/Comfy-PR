import { CNRepos } from "@/src/CNRepos";
import { Suspense } from "react";
import yaml from "yaml";

// Prevent static generation since this page requires database access
export const dynamic = "force-dynamic";

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function ReposPage() {
  return (
    <>
      <div>
        <div>✅: Listed in Registry, And ComfyUI-Manager Legacy version</div>
        <div>✔️: Listed in Registry, Not ComfyUI-Manager Legacy version</div>
        <div>🧪: Ready to Create PR</div>
        <div>👀: Pending Reviewing PR</div>
        <div>🫗: Repos Outside ComfyUI-Manager</div>
      </div>
      <ul className="flex flex-row flex-wrap">
        <Suspense fallback={<div>⏳ Loading...</div>}>
          <DataPage />
        </Suspense>
      </ul>
    </>
  );
}

async function DataPage({ page = 0, size = 10000 }) {
  const data = await CNRepos.find({})
    .sort({ _id: 1 })
    .project({
      repository: 1,
      "crPulls.state": 1,
      "crPulls.data.type": 1,
      "crPulls.data.pull.html_url": 1,
      "crPulls.data.pull.user.login": 1,
      "crPulls.error": 1,
      "cr._id": 1,
      "cm._id": 1,
    })
    .skip(page * size)
    .limit(size)
    .toArray();
  if (!data.length) return null;
  return (
    <>
      {data.map((item: any) => (
        <div key={item.repository}>
          <a href={item.repository} target="_blank" rel="noreferrer" title={yaml.stringify(item)}>
            <noscript>{JSON.stringify(item)}</noscript>
            {(function () {
              // not listed in both cr and cm
              if (!item.cr && !item.cm) return <>🫗</>;
              // already in registry
              if (!!item.cr && !!item.cm && item.crPulls?.state === "ok") return <>✅</>; // by pr bot
              if (!!item.cr && !!item.cm) return <>☑️</>; // not by pr bot, but in cm
              if (!!item.cr && !item.cm) return <>✔️</>; // not by pr bot, not in cm
              // has cm, check crPulls status
              if (!item.crPulls) return <>🧪</>;
              if (item.crPulls.state === "ok") return <>👀</>;
              if (item.crPulls.error) return <span title={item.crPulls.error}>❗</span>;
              return <>❓</>;
            })()}
          </a>
        </div>
      ))}

      <Suspense fallback={<div className="animate-spin">⌛</div>}>
        <DataPage page={page + 1} />
      </Suspense>
    </>
  );
}
