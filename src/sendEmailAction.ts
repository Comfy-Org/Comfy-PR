"use server";
import { $elemMatch } from "@/packages/mongodb-pipeline-ts/$elemMatch";
import { TaskDataOrNull, type Task } from "@/packages/mongodb-pipeline-ts/Task";
import DIE from "@snomiao/die";
import pMap from "p-map";
import { snoflow } from "snoflow";
import type { z } from "zod";
import type { PullStatusShown } from "./analyzePullsStatus";
import { CNRepos } from "./CNRepos";
import { $filaten } from "./db";
import { enqueueEmailTask } from "./EmailTasks";
import { zSendEmailAction } from "./followRuleSchema";
import { yaml } from "./utils/yaml";

export async function sendEmailAction({
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
      if (action.provider !== "google") DIE("Currently we only support gmail sender");
      const loadedAction = await snoflow([action])
        .map((e) => yaml.stringify(e))
        .map((e) =>
          // replace {{var}} s
          e.replace(
            /{{\$([_A-Za-z0-9]+)}}/,
            (_, key: string) =>
              (payload as any)[key] || DIE("Missing key: " + key + " in payload: " + JSON.stringify(payload)),
          ),
        )
        .map((e) => yaml.parse(e))
        .map((y) => zSendEmailAction.parse(y))
        .map((a) => ({ ...a, action: "send-email" }))
        .toLast();

      if (runAction) {
        const task = await enqueueEmailTask(loadedAction);
        console.log(rule.name + " email enqueued :" + yaml.stringify(loadedAction));
        await CNRepos.updateOne($filaten({ crPulls: { data: $elemMatch({ pull: { html_url: payload.url } }) } }), {
          $set: { "crPulls.data.$.emailTask_id": task._id },
        });
      }
      return loadedAction;
    },
    { concurrency: 1 },
  );
}
