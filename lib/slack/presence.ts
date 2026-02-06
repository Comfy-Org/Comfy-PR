#!/usr/bin/env bun
import { slack } from "@/lib";
import { parseArgs } from "util";
import yaml from "yaml";

/**
 * Get user presence status
 */
export async function getUserPresence(userId: string) {
  try {
    const [presenceResult, userInfo] = await Promise.all([
      slack.users.getPresence({ user: userId }),
      slack.users.info({ user: userId }),
    ]);

    if (!presenceResult.ok) {
      throw new Error(`Failed to get presence: ${presenceResult.error || "unknown error"}`);
    }

    const user = userInfo.user as Record<string, unknown>;

    return {
      user_id: userId,
      username: user?.name || userId,
      real_name: user?.real_name || userId,
      presence: presenceResult.presence,
      online: presenceResult.online,
      auto_away: presenceResult.auto_away,
      manual_away: presenceResult.manual_away,
      connection_count: presenceResult.connection_count,
      last_activity: presenceResult.last_activity,
      ...(user?.tz && {
        timezone: user.tz,
        timezone_label: user.tz_label,
        timezone_offset: user.tz_offset,
      }),
    };
  } catch (error) {
    console.error("Error getting user presence:", error);
    throw error;
  }
}

/**
 * Get presence for multiple users
 */
export async function getBulkUserPresence(userIds: string[]) {
  try {
    const results = await Promise.all(userIds.map((userId) => getUserPresence(userId)));

    return {
      total_users: results.length,
      users: results,
      summary: {
        online: results.filter((r) => r.presence === "active").length,
        away: results.filter((r) => r.presence === "away").length,
      },
    };
  } catch (error) {
    console.error("Error getting bulk user presence:", error);
    throw error;
  }
}

// CLI usage
if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      user: {
        type: "string",
        short: "u",
      },
      users: {
        type: "string",
        multiple: true,
      },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.user && (!values.users || values.users.length === 0)) {
    console.error("Usage: bun lib/slack/presence.ts --user <user_id>");
    console.error("   or: bun lib/slack/presence.ts --users <user1> --users <user2> ...");
    console.error("\nExamples:");
    console.error("  bun lib/slack/presence.ts --user U123ABC");
    console.error("  bun lib/slack/presence.ts --users U123 --users U456 --users U789");
    process.exit(1);
  }

  let result;
  if (values.user) {
    result = await getUserPresence(values.user);
  } else if (values.users && values.users.length > 0) {
    result = await getBulkUserPresence(values.users);
  }

  console.log(yaml.stringify(result));
}
