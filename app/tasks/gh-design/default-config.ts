// default configuration, can be updated via meta editor
const MATCH_LABEL = "Design"; // comma-separated list of labels to match
const SLACK_CHANNEL_NAME = "product"; // Slack channel to notify about design items
// const SLACK_CHANNEL_NAME = "sno-test-channel"; // Slack channel to notify about design items
// check all url = V/tasks/gh-design
// const CHECKALL_URL = process.env.VERCEL_PRODUCTION_URL || "https://comfy-pr.vercel.app";
const SLACK_MESSAGE_TEMPLATE = `🎨 *New Design {{ITEM_TYPE}}*: <{{URL}}|{{TITLE}}>`;
const SLACK_MSG_URL_TEMPLATE = `https://comfy-organization.slack.com/archives/{{CHANNEL_ID}}/p{{TSNODOT}}`;
const REQUEST_REVIEWERS = ["PabloWiedemann"];
const REPOS_TO_SCAN_URLS = [
  "https://github.com/Comfy-Org/ComfyUI_frontend",
  "https://github.com/Comfy-Org/desktop",
  // "https://github.com/comfyanonymous/ComfyUI" // frontend contents moved to Comfy-Org/ComfyUI_frontend
];

export const ghDesignDefaultConfig = {
  MATCH_LABEL,
  SLACK_CHANNEL_NAME,
  SLACK_MESSAGE_TEMPLATE,
  SLACK_MSG_URL_TEMPLATE,
  REQUEST_REVIEWERS,
  REPOS_TO_SCAN_URLS,
};
