import { CommentEditor } from "./CommentEditor";
/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function PRCommentsPage() {
  await updateCNReposCRPullsComments();
  const value = '```json\n{\n  "name": "snomiao"\n}\n```';
  return (
    <CommentEditor
      onChange={async (text) => {
        "use server";
        // value=text
        console.log({ text });
        return { text };
      }}
      defaultValue={value}
      defaultLanguage={"markdown"}
    />
  );
}
