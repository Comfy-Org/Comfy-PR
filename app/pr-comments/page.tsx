import { CommentEditor } from "./CommentEditor";
/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function PRCommentsPage() {
  await updateCNReposCRPullsComments();
  const value;
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
