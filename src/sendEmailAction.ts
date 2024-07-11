"use server";
import { TaskDataOrNull, type Task } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import pMap from "p-map";
import { snoflow } from "snoflow";
import type { z } from "zod";
import type { PullStatusShown } from "./analyzePullsStatus";
import { EmailTasks, enqueueEmailTask } from "./EmailTasks";
import { zSendEmailAction } from "./followRuleSchema";
import { yaml } from "./utils/yaml";
import { getGCloudOAuth2Client } from "./gcloud/GCloudOAuth2Credentials";
import { CNRepos } from "./CNRepos";
import { $filaten } from "./db";
import { $elemMatch } from "@/packages/mongodb-pipeline-ts/$elemMatch";

export async function runSendEmailAction({
  matched,
  action,
  runAction,
  rule,
}: {
  matched: Task<PullStatusShown[]>;
  action: z.infer<typeof zSendEmailAction>;
  runAction: boolean;
  rule: { name: string };
}) {
  return await pMap(
    TaskDataOrNull(matched) ?? DIE("NO-PAYLOAD-AVAILABLE"),
    async (payload) => {
      action.provider === "google" || DIE("Currently we only support gmail sender");
      const loadedAction = await snoflow([action])
        .map((e) => yaml.stringify(e))
        .map((e) =>
          // replace {{var}} s
          e.replace(
            /{{\$(\w+)}}/,
            (_, key: string) =>
              (payload as any)[key] || DIE("Missing key: " + key + " in payload: " + JSON.stringify(payload)),
          ),
        )
        .map((e) => yaml.parse(e))
        .map((y) => zSendEmailAction.parse(y))
        .map((a) => ({ ...a, action: "send-email" }))
        .toLast();

      if (runAction) {
        const task = await enqueueEmailTask(loadedAction)
        await CNRepos.updateOne(
          $filaten({ crPulls: { data: $elemMatch({ pull: { html_url: payload.url } }) } }),
          { $set: { "crPulls.data.$.emailTask_id": task._id } },
        )
      }
      return loadedAction;
    },
    { concurrency: 1 },
  );
}
