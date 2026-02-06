#!/usr/bin/env bun
import { slack } from "@/lib";
import { parseArgs } from "util";
import fs from "fs";

/**
 * Upload a file to Slack
 * @param channel - Channel ID to upload to
 * @param filePath - Local file path to upload
 * @param options - Optional parameters (title, initialComment, threadTs)
 */
async function uploadSlackFile(
  channel: string,
  filePath: string,
  options: {
    title?: string;
    initialComment?: string;
    threadTs?: string;
  } = {},
) {
  try {
    // Read file from disk
    const fileContent = await Bun.file(filePath).arrayBuffer();
    const fileName = filePath.split("/").pop() || "file";

    const uploadParams: unknown = {
      channels: channel,
      file: Buffer.from(fileContent),
      filename: fileName,
      title: options.title || fileName,
    };

    if (options.initialComment) {
      uploadParams.initial_comment = options.initialComment;
    }

    if (options.threadTs) {
      uploadParams.thread_ts = options.threadTs;
    }

    const result = await slack.files.uploadV2(uploadParams);

    if (result.ok && (result as Record<string, unknown>).file) {
      console.log(`File uploaded successfully: ${(result as Record<string, unknown>).file.id}`);
      console.log(`File URL: ${(result as Record<string, unknown>).file.permalink}`);
      return result;
    } else {
      throw new Error(`Failed to upload file: ${result.error || "unknown error"}`);
    }
  } catch (error) {
    console.error("Error uploading Slack file:", error);
    throw error;
  }
}

/**
 * Download a file from Slack
 * @param fileId - Slack file ID
 * @param outputPath - Local path to save the file
 */
async function downloadSlackFile(fileId: string, outputPath: string) {
  try {
    // Get file info first
    const fileInfo = await slack.files.info({ file: fileId });

    if (!fileInfo.ok || !fileInfo.file) {
      throw new Error(`Failed to get file info: ${fileInfo.error || "unknown error"}`);
    }

    const file = fileInfo.file;
    const downloadUrl = file.url_private_download || file.url_private;

    if (!downloadUrl) {
      throw new Error("No download URL available for this file");
    }

    // Download the file using Slack bot token for authentication
    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    // Save to disk
    const buffer = await response.arrayBuffer();
    await Bun.write(outputPath, buffer);

    console.log(`File downloaded successfully to: ${outputPath}`);
    console.log(`File name: ${file.name}`);
    console.log(`File size: ${file.size} bytes`);

    return {
      filePath: outputPath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  } catch (error) {
    console.error("Error downloading Slack file:", error);
    throw error;
  }
}

/**
 * Get file info from Slack
 * @param fileId - Slack file ID
 */
async function getSlackFileInfo(fileId: string) {
  try {
    const result = await slack.files.info({ file: fileId });

    if (result.ok && result.file) {
      const file = result.file;
      return {
        id: file.id,
        name: file.name,
        title: file.title,
        mimetype: file.mimetype,
        size: file.size,
        url: file.permalink,
        url_private: file.url_private,
        url_private_download: file.url_private_download,
        created: file.created,
        user: file.user,
      };
    } else {
      throw new Error(`Failed to get file info: ${result.error || "unknown error"}`);
    }
  } catch (error) {
    console.error("Error getting Slack file info:", error);
    throw error;
  }
}

/**
 * Post a message with file attachments to Slack
 * @param channel - Channel ID
 * @param text - Message text
 * @param filePaths - Array of local file paths to attach
 * @param threadTs - Optional thread timestamp to reply in thread
 */
async function postMessageWithFiles(
  channel: string,
  text: string,
  filePaths: string[],
  threadTs?: string,
) {
  try {
    // Upload all files first
    const uploadResults = await Promise.all(
      filePaths.map((filePath) =>
        uploadSlackFile(channel, filePath, {
          threadTs,
          initialComment: text,
        }),
      ),
    );

    console.log(`Posted message with ${filePaths.length} file(s)`);
    return uploadResults;
  } catch (error) {
    console.error("Error posting message with files:", error);
    throw error;
  }
}

// CLI interface
if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      command: {
        type: "string",
      },
      channel: {
        type: "string",
        short: "c",
      },
      file: {
        type: "string",
        short: "f",
      },
      fileId: {
        type: "string",
      },
      output: {
        type: "string",
        short: "o",
      },
      title: {
        type: "string",
        short: "t",
      },
      comment: {
        type: "string",
        short: "m",
      },
      thread: {
        type: "string",
      },
      text: {
        type: "string",
      },
    },
    strict: false,
    allowPositionals: true,
  });

  const command = positionals[0] || values.command;

  switch (command) {
    case "upload":
      if (!values.channel || !values.file) {
        console.error(
          "Usage: bun bot/slack/file.ts upload --channel <channel_id> --file <file_path>",
        );
        console.error("Optional: --title <title> --comment <message> --thread <thread_ts>");
        process.exit(1);
      }
      await uploadSlackFile(
        typeof values.channel === "string" ? values.channel : "",
        typeof values.file === "string" ? values.file : "",
        {
          title: typeof values.title === "string" ? values.title : undefined,
          initialComment: typeof values.comment === "string" ? values.comment : undefined,
          threadTs: typeof values.thread === "string" ? values.thread : undefined,
        },
      );
      break;

    case "download":
      if (!values.fileId || !values.output) {
        console.error(
          "Usage: bun bot/slack/file.ts download --fileId <file_id> --output <output_path>",
        );
        process.exit(1);
      }
      await downloadSlackFile(
        typeof values.fileId === "string" ? values.fileId : "",
        typeof values.output === "string" ? values.output : "",
      );
      break;

    case "info":
      if (!values.fileId) {
        console.error("Usage: bun bot/slack/file.ts info --fileId <file_id>");
        process.exit(1);
      }
      const info = await getSlackFileInfo(typeof values.fileId === "string" ? values.fileId : "");
      console.log(JSON.stringify(info, null, 2));
      break;

    case "post-with-files":
      if (!values.channel || !values.text || !values.file) {
        console.error(
          "Usage: bun bot/slack/file.ts post-with-files --channel <channel_id> --text <message> --file <file_path>",
        );
        console.error("Optional: --thread <thread_ts>");
        console.error("Note: Use --file multiple times for multiple files");
        process.exit(1);
      }
      // Support multiple files
      const files = Array.isArray(values.file) ? values.file : [values.file];
      const fileStrings = files.filter((f): f is string => typeof f === "string");
      await postMessageWithFiles(
        typeof values.channel === "string" ? values.channel : "",
        typeof values.text === "string" ? values.text : "",
        fileStrings,
        typeof values.thread === "string" ? values.thread : undefined,
      );
      break;

    default:
      console.error("Unknown command. Available commands: upload, download, info, post-with-files");
      console.error("\nExamples:");
      console.error(
        '  bun bot/slack/file.ts upload --channel C123 --file ./report.pdf --comment "Here\'s the report"',
      );
      console.error("  bun bot/slack/file.ts download --fileId F123 --output ./downloaded.pdf");
      console.error("  bun bot/slack/file.ts info --fileId F123");
      console.error(
        '  bun bot/slack/file.ts post-with-files --channel C123 --text "Check these files" --file ./file1.pdf --file ./file2.png',
      );
      process.exit(1);
  }
}

export { uploadSlackFile, downloadSlackFile, getSlackFileInfo, postMessageWithFiles };
