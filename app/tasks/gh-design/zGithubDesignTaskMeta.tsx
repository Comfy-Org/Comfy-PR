"use client";
import { z } from "zod";

// Define the schema that matches the API validation
export const zGithubDesignTaskMeta = z.object({
  slackMessageTemplate: z
    .string()
    .min(1, "Slack message template cannot be empty")
    .refine(
      (template) => template.includes("{{ITEM_TYPE}}"),
      "Slack message template must include {{ITEM_TYPE}} placeholder",
    )
    .refine(
      (template) => template.includes("{{URL}}"),
      "Slack message template must include {{URL}} placeholder",
    )
    .refine(
      (template) => template.includes("{{TITLE}}"),
      "Slack message template must include {{TITLE}} placeholder",
    ),
  requestReviewers: z.array(
    z.object({
      value: z.string().min(1, "Reviewer username cannot be empty"),
    }),
  ),
  repoUrls: z.array(
    z.object({
      value: z
        .string()
        .url("Repository URL must be a valid URL")
        .refine(
          (url) => url.startsWith("https://github.com"),
          "Repository URL must start with https://github.com",
        ),
    }),
  ),
});
