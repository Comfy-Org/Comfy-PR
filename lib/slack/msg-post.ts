#!/usr/bin/env bun
import { slack } from "@/lib";
import { uploadSlackFile } from "./file";
import { writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Slack message length limit for text in mrkdwn blocks.
 * Under this threshold → post as a chat message.
 * Over this threshold  → upload as a .md file.
 */
const SMART_POST_THRESHOLD = 2900;

export interface SmartPostOptions {
  /** Thread timestamp to reply in */
  threadTs?: string;
  /** Title used as the filename when uploading as a file (default: "deliverable") */
  title?: string;
  /** Explicit file path to save to before uploading (optional) */
  filePath?: string;
  /** Comment to accompany file uploads (default: same as title) */
  comment?: string;
}

export interface SmartPostResult {
  method: "message" | "file";
  ts?: string;
  fileId?: string;
  fileUrl?: string;
}

/**
 * Smart-post: send short content as a Slack message, long content as a file upload.
 *
 * Short (≤ 2900 chars): posts via chat.postMessage — appears inline in the thread.
 * Long (> 2900 chars):  writes content to a .md file and uploads via files.uploadV2.
 *
 * @param channel  - Slack channel ID
 * @param text     - Content to post (plain text or markdown)
 * @param options  - threadTs, title, filePath, comment
 */
export async function smartPost(
  channel: string,
  text: string,
  options: SmartPostOptions = {},
): Promise<SmartPostResult> {
  const { threadTs, title = "deliverable", filePath, comment } = options;

  if (text.length <= SMART_POST_THRESHOLD) {
    // Short enough — post as a normal message
    const result = await slack.chat.postMessage({
      channel,
      text,
      thread_ts: threadTs,
      mrkdwn: true,
    });

    if (!result.ok) {
      throw new Error(`Failed to post message: ${result.error}`);
    }

    return { method: "message", ts: result.ts };
  }

  // Too long — save to a .md file then upload
  const savePath =
    filePath || join(tmpdir(), `${title.replace(/[^a-z0-9-]/gi, "-")}-${Date.now()}.md`);

  mkdirSync(join(savePath, ".."), { recursive: true });
  writeFileSync(savePath, text, "utf-8");

  const uploadResult = await uploadSlackFile(channel, savePath, {
    title,
    initialComment: comment || title,
    threadTs,
  });

  const file = (uploadResult as unknown as Record<string, unknown>).file as
    | Record<string, unknown>
    | undefined;

  return {
    method: "file",
    fileId: file?.id as string | undefined,
    fileUrl: file?.permalink as string | undefined,
  };
}
