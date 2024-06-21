import { csvFormat, csvParse } from "d3";
import Link from "next/link";

export function PullsStatusTable({
  pullsStatus,
}: {
  pullsStatus: {
    lastwords: string;
    repository: string;
    author_email: string;
    ownername: string;
    on_registry: boolean;
    state: "OPEN" | "MERGED" | "CLOSED";
    url: string;
    head: string;
    comments: number;
    updated: string;
  }[];
}) {
  const rows = csvParse(csvFormat(pullsStatus));
  const header = Object.keys(rows[0]) as (keyof (typeof pullsStatus)[number])[];
  // cosnt data = yaml.pasre(yaml.stringify(r))
  // const body = r.
  return (
    <div className="max-w-full overflow-auto h-80vh">
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
                  <div className="max-w-20em">
                    {(() => {
                      const value = item[key];
                      if (typeof value === "boolean") return value ? "✅" : "❌";
                      if (key === "url") {
                        const value = item[key];
                        return (
                          <Link href={value} target='_blank'>{value.replace("https://github.com", "").replace("/pull/", " #")}</Link>
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
