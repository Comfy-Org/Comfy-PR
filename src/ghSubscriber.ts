import sflow from "sflow";
import { createOctokit } from "./createOctokit";
import { parseGithubRepoUrl } from "./parseOwnerRepo";

const tokens = process.env.GH_SUBSCRIBER_TOKENS?.split(",") || [];
const gh = (token: string) => createOctokit({ auth: token }).rest;

// dont await
showSubscriberUsers();

if (import.meta.main) {
  await showSubscriberUsers();
  // subscribeToRepo('')
  await watchRepo("https://github.com/snomiao/ComfyNode-Registry-test");
  // await listNotifications()
}

async function showSubscriberUsers() {
  console.log(
    `GH_TOKEN_SUBSCRIBER Users: `,
    await sflow(tokens)
      .map((token) => gh(token))
      .map(async (gh) => {
        const { data: user } = await gh.users.getAuthenticated();
        return `${user.login} <${user.email}>`;
      })
      .join(", ")
      .text(),
  );
}
async function listNotifications() {
  console.log(
    `Messages: `,
    await sflow(tokens)
      .map((token) => gh(token))
      .map(async (gh) => {
        const { data: result } = await gh.activity.listNotificationsForAuthenticatedUser();
        return JSON.stringify(result);
      })
      .toArray(),
  );
}

// list subscribed threads
// await sflow(tokens)
//   .map((token) => gh(token))
//   .map(async (gh) => {
//     console.log(await gh.activity.getRepoSubscription({owner: }));
//   })
//   .run();

export async function watchRepo(repoUrl: string) {
  await sflow(tokens)
    .map((token) => gh(token))
    .map(async (gh) => {
      const result = await gh.activity.setRepoSubscription({
        ...parseGithubRepoUrl(repoUrl),
        subscribed: true,
      });

      console.log(result);
    })
    .run();
}
export async function unwatchRepo(repoUrl: string) {
  await sflow(tokens)
    .map((token) => gh(token))
    .map(async (gh) => {
      const result = await gh.activity.setRepoSubscription({
        ...parseGithubRepoUrl(repoUrl),
        subscribed: false,
      });
      console.log(result);
    })
    .run();
}
