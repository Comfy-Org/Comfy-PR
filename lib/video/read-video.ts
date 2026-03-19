#!/usr/bin/env bun

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { parseArgs } from "util";

const DEFAULT_PROMPT = `Analyze this video recording in detail. Describe:
1. Step-by-step actions taken (in chronological order)
2. Any UI elements, buttons, menus, or dialogs shown
3. Temporal changes — what changed from start to end
4. Any errors, warnings, or unexpected behavior visible
5. The overall workflow or task being performed

Be specific about timestamps and transitions.`;

export interface ReadVideoOptions {
  prompt?: string;
  model?: "gemini" | "gpt4o";
  outputMd?: boolean;
}

export interface ReadVideoResult {
  description: string;
  model: string;
  usage: Record<string, unknown>;
  mdPath?: string;
}

/**
 * Analyze a video file using AI vision models.
 *
 * @param videoPath - Path to the video file
 * @param options - Model selection and custom prompt
 * @returns Analysis description, model used, and usage stats
 */
export async function readVideo(
  videoPath: string,
  options: ReadVideoOptions = {},
): Promise<ReadVideoResult> {
  const { prompt = DEFAULT_PROMPT, model = "gemini", outputMd = true } = options;

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const result =
    model === "gpt4o"
      ? await readVideoWithGpt4o(videoPath, prompt)
      : await readVideoWithGemini(videoPath, prompt);

  if (outputMd) {
    const mdPath = videoPath.replace(/\.[^.]+$/, "") + ".md";
    const mdContent = `# Video Analysis\n\n**Source**: \`${path.basename(videoPath)}\`\n**Model**: ${result.model}\n**Usage**: ${JSON.stringify(result.usage)}\n\n---\n\n${result.description}\n`;
    fs.writeFileSync(mdPath, mdContent);
    result.mdPath = mdPath;
  }

  return result;
}

/**
 * Analyze video natively with Gemini 2.5 Flash (supports video/* inline data)
 */
async function readVideoWithGemini(videoPath: string, prompt: string): Promise<ReadVideoResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is required");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const videoBuffer = fs.readFileSync(videoPath);
  const base64Video = videoBuffer.toString("base64");
  const mimeType = getMimeType(videoPath);

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType,
        data: base64Video,
      },
    },
  ]);

  const response = result.response;
  const text = response.text();
  const usageMetadata = response.usageMetadata;

  return {
    description: text,
    model: "gemini-2.5-flash",
    usage: {
      promptTokens: usageMetadata?.promptTokenCount,
      candidateTokens: usageMetadata?.candidatesTokenCount,
      totalTokens: usageMetadata?.totalTokenCount,
    },
  };
}

/**
 * Analyze video with GPT-4o by extracting frames with ffmpeg
 */
async function readVideoWithGpt4o(videoPath: string, prompt: string): Promise<ReadVideoResult> {
  const openai = new OpenAI();
  const frames = await extractFrames(videoPath);

  if (frames.length === 0) {
    throw new Error("No frames could be extracted from the video. Is ffmpeg installed?");
  }

  const imageMessages: OpenAI.Chat.Completions.ChatCompletionContentPart[] = frames.map(
    (frame) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:image/jpeg;base64,${frame}`,
        detail: "low" as const,
      },
    }),
  );

  const result = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${prompt}\n\n(${frames.length} frames extracted at 1fps, sampled every other frame)`,
          },
          ...imageMessages,
        ],
      },
    ],
    max_tokens: 4096,
  });

  return {
    description: result.choices[0].message.content || "",
    model: "gpt-4o",
    usage: {
      promptTokens: result.usage?.prompt_tokens,
      completionTokens: result.usage?.completion_tokens,
      totalTokens: result.usage?.total_tokens,
      framesUsed: frames.length,
    },
  };
}

/**
 * Extract frames from video at 1fps using ffmpeg, then sample every other frame
 */
async function extractFrames(videoPath: string): Promise<string[]> {
  const tmpDir = path.join(path.dirname(videoPath), `.frames-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const { $ } = await import("bun");
    // Extract at 1 fps
    await $`ffmpeg -i ${videoPath} -vf "fps=1" -q:v 2 ${tmpDir}/frame-%04d.jpg -loglevel error`.quiet();

    // Read all frames
    const frameFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.endsWith(".jpg"))
      .sort();

    // Sample every other frame to reduce token usage
    const sampledFiles = frameFiles.filter((_, i) => i % 2 === 0);

    const frames: string[] = [];
    for (const file of sampledFiles) {
      const framePath = path.join(tmpDir, file);
      const buffer = fs.readFileSync(framePath);
      frames.push(buffer.toString("base64"));
    }

    return frames;
  } finally {
    // Cleanup temp frames
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".m4v": "video/mp4",
  };
  return mimeMap[ext] || "video/mp4";
}

// CLI interface
if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      file: { type: "string", short: "f" },
      model: { type: "string", short: "m" },
      prompt: { type: "string", short: "p" },
    },
    strict: false,
  });

  if (!values.file) {
    console.error(
      "Usage: bun lib/video/read-video.ts -f <video_path> [-m gemini|gpt4o] [-p <prompt>]",
    );
    process.exit(1);
  }

  const result = await readVideo(values.file as string, {
    model: (values.model as "gemini" | "gpt4o") || "gemini",
    prompt: values.prompt as string | undefined,
  });

  console.log(`Model: ${result.model}`);
  console.log(`Usage: ${JSON.stringify(result.usage)}`);
  console.log(`\n${result.description}`);
}
