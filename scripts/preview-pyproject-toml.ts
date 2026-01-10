#!/usr/bin/env bun
import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { $ } from "../src/cli/echoBunShell";

/**
 * Preview what pyproject.toml will be generated for a repository
 * Usage: bun scripts/preview-pyproject-toml.ts [--repo GITHUB_URL] [--output FILE]
 */

async function previewPyprojectToml() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const repoIndex = args.indexOf("--repo");
  const outputIndex = args.indexOf("--output");

  const repoUrl =
    repoIndex >= 0 && args[repoIndex + 1] ? args[repoIndex + 1] : "https://github.com/snomiao/ComfyNode-Registry-test"; // default test repo

  const outputFile = outputIndex >= 0 && args[outputIndex + 1] ? args[outputIndex + 1] : null;

  console.log(`\n🔍 Previewing pyproject.toml for: ${repoUrl}\n`);

  // Create temporary directory
  const tempDir = path.join(os.tmpdir(), `comfy-pr-preview-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Clone the repository
    console.log("📥 Cloning repository...");
    await $`git clone --depth 1 ${repoUrl} ${tempDir}/repo`;

    // Change to repo directory
    const repoDir = `${tempDir}/repo`;

    // Check if pyproject.toml already exists
    const existingToml = `${repoDir}/pyproject.toml`;
    if (existsSync(existingToml)) {
      console.log("⚠️  Repository already has a pyproject.toml file. Backing it up and generating fresh one.\n");
      await $`cd ${repoDir} && mv pyproject.toml pyproject.toml.backup`;
    }

    // Run comfy node init
    console.log("🛠️  Running 'comfy node init'...");
    await $`cd ${repoDir} && echo N | comfy node init`;

    // Read the generated pyproject.toml
    const pyprojectContent = await readFile(`${repoDir}/pyproject.toml`, "utf8");

    console.log("\n📄 Generated pyproject.toml:\n");
    console.log("=" + "=".repeat(59));
    console.log(pyprojectContent);
    console.log("=" + "=".repeat(59));

    // Try to fetch description from ComfyUI-Manager (optional enhancement)
    try {
      const { fetchRepoDescriptionMap } = await import("../src/fetchRepoDescriptionMap");
      const repoDescriptionMap = await fetchRepoDescriptionMap();
      const urlParts = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (urlParts) {
        const referenceUrl = `https://github.com/${urlParts[1]}/${urlParts[2]}`;
        const description = repoDescriptionMap[referenceUrl];
        if (description) {
          console.log(`\n💡 Note: The actual PR would replace the description with:\n   "${description}"\n`);
        }
      }
    } catch (e) {
      console.log("\n💡 Note: Could not fetch description from ComfyUI-Manager database");
    }

    // Save to output file if specified
    if (outputFile) {
      await writeFile(outputFile, pyprojectContent);
      console.log(`\n✅ Saved to: ${outputFile}`);
    }

    // Show what modifications would be made
    console.log("\n📝 Additional modifications in actual PR:");
    console.log("   1. Description field would be filled from ComfyUI-Manager database");
    console.log(
      "   2. File would be committed with message: 'chore(pyproject): Add pyproject.toml for Custom Node Registry'",
    );
    console.log("   3. Pushed to branch: 'pyproject'\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log("🧹 Cleaning up temporary files...");
    await rm(tempDir, { recursive: true, force: true });
  }
}

// Run the preview
if (import.meta.main) {
  await previewPyprojectToml();
}

// For testing/mocking purposes, export the function
export { previewPyprojectToml };
