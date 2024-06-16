import { updateCNReposCRPullsComments } from "@/src/updateCNReposCRPullsComments";
import { readFile } from "fs/promises";
import RuleEditor from "./RuleEditor";

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function PRCommentsPage() {
  await updateCNReposCRPullsComments();
  const defaultValue = await readFile("./app/pr-comments/default-rule.yaml",'utf8');
  return (
    <RuleEditor
      onChange={async (text) => {
        "use server";
        console.log({ text });
        return { text };
      }}
      defaultValue={defaultValue}
      defaultLanguage={"yaml"}
    />
  );
}
