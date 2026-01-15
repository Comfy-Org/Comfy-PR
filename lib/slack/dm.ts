import { upsertSlackMessage } from "@/app/tasks/gh-desktop-release-notification/upsertSlackMessage";
import DIE from "@snomiao/die";
import { pageFlow } from "sflow";
import { getSlack, isSlackAvailable } from ".";
import { getSlackCached } from "./slackCached";

// export type SlackWeeklyDM = {
//     member
// }
// export const SlackWeeklyDM =db.collection

if (import.meta.main) {
  if (!isSlackAvailable()) {
    console.log("Slack token not configured, skipping DM test");
  } else {
    const slackCached = getSlackCached();
    const slack = getSlack();

    // await pageFlow(undefined as undefined | string, async (cursor, limit = 100) => {
    //     const res = await slackCached.conversations.list({  })
    //     return { data: res.channels, next: res.response_metadata?.next_cursor || null }
    // }).flat()
    //     .filter(e => JSON.stringify(e).match('snomiao'))
    //     .forEach(member => {
    //         // member.name
    //         // slack.conversations.list()
    //     }).log()
    //     .run()
    await pageFlow(undefined as undefined | string, async (cursor, limit = 100) => {
      const res = await slackCached.users.list({ limit: 100, cursor });
      return { data: res.members, next: res.response_metadata?.next_cursor || null };
    })
      .flat()
      .filter((e) => e.name === "snomiao")
      // open DM
      // .by(mapMixins(async member => ({
      //     a: (await slackCached.conversations.open({
      //         users: [member.id].join(',') || DIE('fail to get id from member ' + JSON.stringify({ member }))
      //     }))?.channel || DIE('fail to open conversation to member ' + member.name)
      // })))

      // attach channel info to member
      .mapMixin(async (member) => ({
        channel:
          (await slackCached.conversations
            .open({
              users:
                [member.id].join(",") ||
                DIE("fail to get id from member " + JSON.stringify({ member })),
            })
            .then((res) => res?.channel)) ||
          DIE("fail to open conversation to member " + member.name),
      }))
      // send message
      .map(async (member) => {
        const chanId = member.channel.id || DIE("no channel id for " + JSON.stringify({ member }));
        const lastMessageUrl = await slack.conversations
          .history({ channel: chanId, limit: 1 })
          .then(async (res) => {
            const lastMessage = res.messages?.[0];
            if (!lastMessage) return;
            return await slack.chat
              .getPermalink({
                channel: chanId,
                message_ts:
                  lastMessage?.ts ||
                  DIE(
                    "Got last message without chanId: " + JSON.stringify({ chanId, lastMessage }),
                  ),
              })
              .then(
                (res) =>
                  res.permalink ||
                  DIE("got empty permalink " + JSON.stringify({ res, chanId, lastMessage })),
              );
          });
        await upsertSlackMessage({
          channel: member.channel.id,
          text: "hello",
          url: lastMessageUrl,
        });
      })
      // log result
      .log()
      .run();
  }
}
