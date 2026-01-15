import type { PullsStatus } from "@/src/analyzePullsStatus";
import { csvFormat, csvParse } from "d3";
import Link from "next/link";
import { keys } from "rambda";
import { SaveButton } from "./SaveButton";

export function PullsStatusTable({
  name,
  pullsStatus,
}: {
  name?: string;
  pullsStatus: PullsStatus;
}) {
  const csv = csvFormat(pullsStatus);
  const rows = csvParse(csv);
  const first = rows[0] ?? {};
  if (!first) return <>NO DATA</>;
  const header = keys(first) as (keyof (typeof pullsStatus)[number])[];
  const filename = `${new Date().toISOString().slice(0, 10)}-${name || "export"}.csv`;
  return (
    <div className="max-w-full overflow-auto h-80vh">
      {!!name && (
        <header className="flex justify-between w-full">
          <h4>{name}</h4>
          <div className="flex gap-4">
            <SaveButton content={csv} filename={filename}>
              💾{filename}
            </SaveButton>
          </div>
        </header>
      )}
      <table className="shadow-md w-[-webkit-fill-available]">
        <thead className="sticky top-0">
          <tr className="capitalize text-start bg-blue-800">
            <th className="p-2">{"No."}</th>
            {header.map((key) => (
              <th key={String(key)} className="p-2">
                {String(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pullsStatus.map((item) => (
            <tr key={item.url} className="even:bg-cyan-700 odd:bg-cyan-800">
              <td className="p-2">{pullsStatus.indexOf(item) + 1}</td>
              {header.map((key) => (
                <td key={key} className="p-2">
                  <div className="max-w-10em">
                    {(() => {
                      const value = item[key];
                      if (typeof value === "boolean") return value ? "✅" : "❌";
                      if (key === "url") {
                        const value = item[key];
                        return (
                          <Link href={value} target="_blank">
                            {value.replace("https://github.com", "").replace("/pull/", " #")}
                          </Link>
                        );
                      }
                      return value;
                    })()}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
