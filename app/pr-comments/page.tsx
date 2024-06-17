import { updateCNReposCRPullsComments } from "@/src/updateCNReposCRPullsComments";
import { readFile } from "fs/promises";
import dynamic from "next/dynamic";

const RuleEditor = dynamic(() => import("./RuleEditor"), { ssr: false });

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function PRCommentsPage() {
  const defaultValue = await readFile("./app/pr-comments/default-rule.yaml", "utf8");
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
