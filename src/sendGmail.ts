import DIE from "@snomiao/die";
// import type { Credentials } from "google-auth-library";
import type { Credentials } from "google-auth-library";
import { GoogleApis } from "googleapis";
import type { OAuth2Client } from "googleapis-common";
import { createMimeMessage } from "mail-mime-builder";
import markdownIt from "markdown-it";
import {
  GCloudOAuth2Credentials,
  getGCloudOAuth2Client,
  handleGCloudOAuth2Callback,
} from "./gcloud/GCloudOAuth2Credentials";
if (import.meta.main) {
  // send test email
  const name = "snomiao";
  const from = "snomiao@gmail.com";
  const to = ".snomiao@gmail.com";
  const subject = "Hello! snomiao";
  const markdown = `
# hello from sno
  
You've <b>just</b> received an *email* from snomiao.

Thank you for receiving this email!!!!
  `;

  const html = markdownIt().render(markdown);
  console.log(html);

  const sent = await sendGmail({
    name,
    from,
    to,
    subject,
    html,
    auth: await getGCloudOAuth2Client({
      email: from,
      scope: ["https://www.googleapis.com/auth/gmail.compose"],
      authorize: async (url) => {
        // check saved credential in db
        const getCred = async () =>
          (
            await GCloudOAuth2Credentials.findOne({
              scopes: "https://www.googleapis.com/auth/gmail.compose",
              email: from,
              credentials: { $exists: true },
            })
          )?.credentials;
        const cred = await getCred();
        if (cred) return cred;

        // otherwise wait for user approve
        (await (await import("open")).default(url)).unref();
        // setup one time server to receive ?code={{....}}
        return await new Promise<Credentials>((r) => {
          const server = Bun.serve({
            fetch: async (req) => {
              // wait for code, and then save to db
              const res = await handleGCloudOAuth2Callback(req);
              const cred = await getCred();
              if (cred) r(cred);
              server.stop();
              return res;
            },
          });
        });
      },
    }),
  });
  console.log(sent);
}

export async function sendGmail({
  name,
  from,
  to,
  subject,
  text,
  html,
  auth,
}: {
  name: string;
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  auth: OAuth2Client;
}) {
  const msg = createMimeMessage();
  msg.setSender({ name: name, addr: from });
  msg.setRecipient(to);
  msg.setSubject(subject);
  text && msg.addMessage({ contentType: "text/plain", data: text });
  html && msg.addMessage({ contentType: "text/html", data: html });
  text || html || DIE("Missing msg body");

  const result = await new GoogleApis().gmail("v1").users.messages.send({
    auth,
    userId: from,
    requestBody: { raw: btoa(msg.asRaw()) },
  });
  const sent = result.data;
  return sent;
}
