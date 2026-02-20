#!/usr/bin/env bun

/**
 * Downloads an avatar image and sets it as the Slack bot's profile photo
 * Usage: bun bot/slack/avatar.ts [--url <avatar-url>]
 */

import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import minimist from "minimist";
import { slackApp } from ".";

const DEFAULT_AVATAR_URL = "https://avatars.githubusercontent.com/u/172744619?v=4&size=512";

async function downloadAvatar(url: string): Promise<string> {
  console.log(`Downloading avatar from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download avatar: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const tempFilePath = join(tmpdir(), `slack-avatar-${Date.now()}.jpg`);

  await writeFile(tempFilePath, Buffer.from(buffer));
  console.log(`Avatar saved to: ${tempFilePath}`);

  return tempFilePath;
}

async function setSlackBotAvatar(imagePath: string): Promise<void> {
  console.log("Uploading avatar to Slack...");

  try {
    // Read the image file
    const imageBuffer = await Bun.file(imagePath).arrayBuffer();

    // Upload using users.setPhoto API
    console.log("Setting bot avatar via Slack API...");
    console.log(slackApp.users);
    // TODO: Fix API - setPhoto doesn't exist on slackApp.apps
    // Need to use correct Slack API method for setting bot avatar
    const _result = await (
      (slackApp as unknown as Record<string, unknown>).users as Record<
        string,
        (...args: unknown[]) => unknown
      >
    ).setPhoto({
      image: Buffer.from(imageBuffer),
    });

    // if (result.ok) {
    //   console.log("✓ Bot avatar updated successfully!");
    // } else {
    //   throw new Error(`Slack API error: ${JSON.stringify(result)}`);
    // }
    throw new Error("setPhoto API is not available in current Slack SDK version");
  } catch (error) {
    console.error("Failed to update bot avatar:", error);
    throw error;
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const avatarUrl = argv.url || DEFAULT_AVATAR_URL;

  try {
    // Download the avatar
    const tempFilePath = await downloadAvatar(avatarUrl);

    // Upload to Slack
    await setSlackBotAvatar(tempFilePath);

    // Clean up temp file
    await unlink(tempFilePath);
    console.log("Temp file cleaned up");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

export { downloadAvatar, setSlackBotAvatar };
