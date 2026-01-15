import DIE from "@snomiao/die";
import markdownIt from "markdown-it";
import type { WithId } from "mongodb";
import { sf } from "sflow";
import type { z } from "zod";
import { $stale, db } from "./db";
import type { zSendEmailAction } from "./followRuleSchema";
import { getGCloudOAuth2Client } from "./gcloud/GCloudOAuth2Credentials";
import { sendGmail } from "./sendGmail";

export type EmailTask = {
  mtime: Date;
  state: "waiting" | "sending" | "sent" | "error";
  error?: string;
  provider: "google";
  name: string;
  from: string;
  to: string;
  subject: string;
  /** body is markdown */
  body: string;
};

export const EmailTasks = db.collection<EmailTask>("EmailTasks");
await EmailTasks.createIndex({ from: 1, to: 1, subject: 1 });

if (import.meta.main) {
  sf.sflow(EmailTasks.find({}))
    .map((e) => e.state)
    .toLog();
  // sf.sflow(EmailTasks.watch([], { fullDocument: "whenAvailable" }))
  //   // .filter((c) => c.operationType === "modify")
  //   .toLog()
  //   .then(() => console.log("all done"));
  //   const saved = await enqueueEmailTask({
  //     provider: "google",
  //     name: "Snowstar Miao",
  //     from: "snomiao@gmail.com",
  //     to: "snomiao@gmail.com",
  //     subject: "hello again from email queue 2",
  //     body: `
  // # hello from sno

  // You've <b>just</b> received an *email* from snomiao.

  // Thank you for receiving this email!!!!
  //   `,
  //   });
  //   console.log({ saved });
  // await updateEmailTasks();
}

/**
 * deduplicated by [from, to, subject].join(' ')
 */
export async function enqueueEmailTask(task: z.infer<typeof zSendEmailAction>) {
  const { name, from, to, subject, body, provider } = task;
  return (
    (await EmailTasks.findOneAndUpdate(
      { from, to, subject },
      { $set: task, $setOnInsert: { mtime: new Date(), state: "waiting" } },
      { upsert: true, returnDocument: "after" },
    )) ?? DIE(new Error("fail to enqueue email task"))
  );
}
export async function updateEmailTasks() {
  const count = await sf
    .sflow(EmailTasks.find({ state: "waiting" }))
    .merge(sf.sflow(EmailTasks.find({ state: "sending", mtime: $stale("1m") })))
    .map(async (e) => {
      const { _id, state } = e;
      if (state === "waiting") {
        await EmailTasks.updateOne({ _id }, { $set: { mtime: new Date(), state: "sending" } });
        return await sendEmailTask(e)
          .then(() => EmailTasks.updateOne({ _id }, { $set: { mtime: new Date(), state: "sent" } }))
          .catch((err) =>
            EmailTasks.updateOne(
              { _id },
              { $set: { mtime: new Date(), state: "error", error: String(err) } },
            ),
          );
      }
    })
    .toCount();
  console.log(count, "email tasks processed");
}
export async function sendEmailTask({
  _id,
  state,
  name,
  from,
  to,
  subject,
  body,
  provider,
}: WithId<EmailTask>) {
  // prerequisites
  if (provider !== "google") DIE("providers other than google is implemented yet");
  const auth = await getGCloudOAuth2Client({
    email: from,
    scope: ["https://www.googleapis.com/auth/gmail.compose"],
    authorize: async (url) =>
      DIE(
        "ERROR: Trying send email from " +
          from +
          " but it's not authorized, plz grant permission in " +
          url,
      ),
  });
  // do send
  return sendGmail({
    auth,
    from,
    name,
    to,
    subject,
    html: markdownIt().render(body),
  });
}
