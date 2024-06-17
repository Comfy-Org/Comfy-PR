import { readFile } from "fs/promises";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("../../components/CodeEditor"), { ssr: false });
export default async function PRCommentsPage() {
  const defaultValue = await readFile("./app/pr-comments/default-rule.yaml", "utf8");
  return (
    <Editor
      onChange={async (text) => {
        "use server";
        // update rules by yaml
        console.log({ text });
        return { text };
      }}
      defaultValue={defaultValue}
      defaultLanguage={"yaml"}
    />
  );
}
