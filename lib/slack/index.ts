import { WebClient } from "@slack/web-api";
import { DIE } from "@snomiao/die";

/** @deprecated now we are safe to import slack directly */
export function getSlack(): WebClient {
  return slack;
}

/** @deprecated use slackBot. */
export const slack = lazyInstantiation(
  () =>
    new WebClient(
      process.env.SLACK_BOT_TOKEN?.trim() ||
        DIE("Missing env.SLACK_BOT_TOKEN - Slack functionality is unavailable"),
    ),
);

export const slackBot = lazyInstantiation(
  () =>
    new WebClient(
      process.env.SLACK_BOT_TOKEN?.trim() ||
        DIE("Missing env.SLACK_BOT_TOKEN - Slack functionality is unavailable"),
    ),
);

export const slackApp = lazyInstantiation(
  () =>
    new WebClient(
      process.env.SLACK_APP_TOKEN?.trim() ||
        DIE("Missing env.SLACK_BOT_TOKEN - Slack functionality is unavailable"),
    ),
);
/** @deprecated use slack.api.test  */
export const isSlackAvailable = () => Boolean(process.env.SLACK_BOT_TOKEN?.trim());

if (import.meta.main) {
  await slack.api.test({}); // test token
  console.log("Slack API token is valid.");
}

export function lazyInstantiation<T extends object>(factory: () => T): T {
  let instance: T | undefined = undefined;
  return new Proxy(
    {},
    {
      get(_, prop) {
        instance ??= factory();
        return instance[prop as keyof T];
      },
      set(_, prop, value) {
        instance ??= factory();
        instance[prop as keyof T] = value;
        return true;
      },
    },
  ) as T;
}
