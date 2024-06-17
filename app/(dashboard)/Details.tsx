import { analyzeCRPullsDetails } from "@/src/analyzeCRPullsDetails";
import { csvFormat, csvParse } from "d3";
import Link from "next/link";

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function DetailsTable({ skip = 0, limit = 0 }) {
  const r = await analyzeCRPullsDetails({ skip, limit });
  // const th = ["created_at", "updated_at", "repository", "registryId", "state", "url", "comments", "lastwords"];
  const data = csvParse(csvFormat(r));
  const header = Object.keys(data[0]) as (keyof (typeof r)[number])[];
  // cosnt data = yaml.pasre(yaml.stringify(r))
  // const body = r.
  return (
    <table className="max-w-full overflow-auto">
      <thead>
        <tr className="capitalize text-start bg-blue-800">
          {header.map((key) => (
            <th key={key} className="p-2">
              {key}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.map((item) => (
          <tr key={item.url} className="even:bg-cyan-700">
            {header.map((key) => (
              <td key={key} className="p-2">
                {(() => {
                  const value = item[key];
                  if (key === "url") {
                    return <Link href={value}>{value.replace("https://github.com", "").replace("/pull/", " #")}</Link>;
                  }
                  return value;
                })()}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
