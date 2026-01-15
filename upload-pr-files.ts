import { slack } from "@/lib";
import { readFileSync } from "fs";

const workDir = "/bot/slack/frontend-code-reviews/1768434215-418499";

const files = [
  {
    path: `${workDir}/PR_ANALYSIS.md`,
    comment: "PR #7738 Analysis: Detailed breakdown of all issues found in the review"
  },
  {
    path: `${workDir}/PR_7738_REVIEW_SUMMARY.md`,
    comment: "PR #7738 Review Summary: Comprehensive review with required changes and next steps"
  },
  {
    path: `${workDir}/TROUBLESHOOTING_UPDATED.md`,
    comment: "Updated TROUBLESHOOTING.md: Corrected version with all fixes applied, ready to use"
  },
  {
    path: `${workDir}/CHANGES_SUMMARY.md`,
    comment: "Changes Summary: Quick reference guide for all required modifications"
  }
];

async function uploadFiles() {
  for (const file of files) {
    try {
      console.log(`Uploading ${file.path}...`);
      const content = readFileSync(file.path, 'utf-8');

      const result = await slack.files.uploadV2({
        channel_id: "C09EM82R2HL",
        thread_ts: "1768466981.470589",
        file: Buffer.from(content),
        filename: file.path.split('/').pop(),
        initial_comment: file.comment,
      });

      if (result.ok) {
        console.log(`✅ Uploaded ${file.path}`);
      } else {
        console.error(`❌ Failed:`, result.error);
      }
    } catch (error: any) {
      console.error(`❌ Error:`, error.message);
    }
  }
}

uploadFiles();
