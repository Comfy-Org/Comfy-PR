import { yaml } from "@/src/utils/yaml";
import * as d3 from "d3";
import { DownloadCSVButton } from "./DownloadCSVButton.tsx";
import { summaryGithubContributorAnalyzeTask } from "./summaryGithubContributorAnalyzeTask";

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function GithubContributorAnalyzeTaskPage() {
  const data = await summaryGithubContributorAnalyzeTask();
  const csvContent = d3.csvFormat(data.json);
  return (
    <main>
      <h1>Github Contributor Analyze Task</h1>

      <h2>Totals</h2>
      <code>{yaml.stringify(data.total, null, 2)}</code>

      <h2>Details</h2>
      <DownloadCSVButton csvContent={csvContent} filename="uniq-contributor-emails.csv" />
    </main>
  );
}
