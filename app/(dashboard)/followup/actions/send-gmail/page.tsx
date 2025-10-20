// /followup/actions/email

import { getAuthUser } from "@/app/api/auth/[...nextauth]/getAuthUser";
import {
  TaskDataOrNull,
  TaskError,
  TaskErrorOrNull,
  TaskOK,
} from "@/packages/mongodb-pipeline-ts/Task";
import {
  GCloudOAuth2Credentials,
  getGCloudOAuth2Client,
} from "@/src/gcloud/GCloudOAuth2Credentials";
import { sendGmail } from "@/src/sendGmail";
import { yaml } from "@/src/utils/yaml";
import DIE from "@snomiao/die";
import markdownIt from "markdown-it";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import Markdown from "react-markdown";
export const dynamic = "force-dynamic";
/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function GmailPage() {
  const user = await getAuthUser();
  let authorizeUrl = "";
  const getOAuth2Client = async () =>
    await getGCloudOAuth2Client({
      email: user.email,
      scope: ["https://www.googleapis.com/auth/gmail.compose"],
      authorize: (url) => {
        authorizeUrl = url;
        redirect(authorizeUrl);
      },
      fromUrl: "/followup/actions/send-gmail",
    })
      .then(TaskOK)
      .catch(TaskError);

  const oAuth2ClientTask = await getOAuth2Client();
  const auth = TaskDataOrNull(oAuth2ClientTask);
  const error = TaskErrorOrNull(oAuth2ClientTask);
  console.log(error);

  const emails = await GCloudOAuth2Credentials.find({ credentials: { $exists: true } })
    .map(({ email, scopes }: { email: string; scopes: string[] }) => ({ email, scopes }))
    .toArray();
  return (
    <div className="card-body">
      <Markdown>
        {`
# Gmail Authenticator

Hi ${user.email}, 

This page grants gmail permission to ComfyPR Github Action Worker,
And then the follow up [Rules](/rules/default) worker could send gmails in behalf of your.

Your current status is ${auth ? "READY" : "NOT GRANTED: " + error}

## Current authenticated users for gmail-sending: 

${"```yaml"}
${yaml.stringify(emails).trim() || "- None"}
${"```"}

`}
      </Markdown>
      <div className="flex gap-4">
        {!!(await GCloudOAuth2Credentials.findOne({ email: user.email })) && (
          <button
            className="btn btn-secondary"
            onClick={async () => {
              "use server";
              console.log("resetting");
              await GCloudOAuth2Credentials.deleteMany({ email: user.email });
              revalidatePath("/followup/actions/send-gmail");
            }}
          >
            Reset my comfy-pr permission grant state
          </button>
        )}

        {!auth ? (
          authorizeUrl && (
            <Link className="btn btn-primary" href={authorizeUrl} target="_blank">
              Grant permission to compose gmail
            </Link>
          )
        ) : (
          <>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                "use server";
                console.log(new Error("check"));
                const auth = await getGCloudOAuth2Client({
                  email: user.email,
                  scope: ["https://www.googleapis.com/auth/gmail.compose"],
                  authorize: (url) => {
                    DIE("not possible to authorize here, plz refresh page");
                  },
                });
                console.log(new Error("check"));

                await sendGmail({
                  auth,
                  name: "Yourself",
                  from: user.email,
                  to: user.email,
                  subject: "send your self a test email",
                  html: markdownIt().render("# sent\nthis email send from your self"),
                });
                return { state: "ok" };
              }}
            >
              Send your self a Test e-mail
            </button>

            <Link
              target="_blank"
              href="https://myaccount.google.com/connections"
              className="btn btn-secondary"
            >
              Revoke permission to compose gmail (go to google 3rd party conn manager)
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
