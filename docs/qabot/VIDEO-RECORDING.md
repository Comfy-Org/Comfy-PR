# QA Bot — Video Recording Pipeline

## Vision

QA Bot produces **broadcast-quality videos** that serve as definitive evidence for bug reports, feature demos, and regression tests. Videos should be clear enough to drop into a GitHub issue and immediately communicate the problem/solution.

---

## Recording Modes

### 1. Bug Reproduction Video

**Goal**: Prove a bug exists with clear visual evidence.

```
Structure:
  0:00 - 0:03   Title card: "Bug Reproduction — Issue #10688"
  0:03 - 0:08   Setup: Navigate to relevant page
  0:08 - 0:25   Reproduce: Execute the bug trigger steps
  0:25 - 0:35   Evidence: Highlight the broken behavior
  0:35 - 0:40   End card: Verdict badge
```

### 2. Before/After Comparison Video

**Goal**: Show the difference between `base` branch (broken) and `head` branch (fixed).

```
Structure:
  0:00 - 0:03   Title card: "PR #9500 — Before/After"
  0:03 - 0:20   BEFORE (base branch): Show the bug
  0:20 - 0:22   Transition: "After Fix →"
  0:22 - 0:40   AFTER (head branch): Show it working
  0:40 - 0:45   End card: Verdict
```

### 3. Feature Demo Video

**Goal**: Showcase a new feature for stakeholders.

```
Structure:
  0:00 - 0:03   Title card: "Feature Demo — New Sidebar"
  0:03 - 0:45   Walkthrough: Show the feature in action
  0:45 - 0:50   End card: Summary
```

### 4. Smoke Test Video

**Goal**: Full walkthrough proving key user journeys work.

```
Structure:
  0:00 - 0:05   Title card: "Smoke Test — 2026-04-03"
  0:05 - 2:00   Sequential walkthrough of all test areas
  2:00 - 2:05   End card: Pass/Fail summary
```

---

## Recording Strategy

### Playwright Built-in Recording

Primary recording method — native Playwright video capture:

```typescript
const context = await browser.newContext({
  recordVideo: {
    dir: artifactsDir,
    size: { width: 1920, height: 1080 },
  },
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
```

**Pros**: Simple, reliable, no external deps
**Cons**: No overlays, no cursor highlighting, no annotations

### Enhanced Recording with Overlays

For high-quality output, use a compositor pipeline:

```
Playwright video (raw)
  → ffmpeg: Add cursor overlay
  → ffmpeg: Add title/end cards
  → ffmpeg: Add timestamp watermark
  → ffmpeg: Compress to target size
  → Output: final.mp4
```

### Cursor Visualization

Since Playwright's automated cursor isn't visible in recordings, inject a visible cursor:

```typescript
// Inject cursor dot via CSS overlay
await page.addStyleTag({
  content: `
    #qa-cursor {
      position: fixed; z-index: 99999;
      width: 20px; height: 20px;
      background: rgba(255, 0, 0, 0.6);
      border-radius: 50%;
      pointer-events: none;
      transition: all 0.1s ease;
    }
  `
});

// Update cursor position on every action
page.on('action', async ({ x, y }) => {
  await page.evaluate(([x, y]) => {
    const cursor = document.getElementById('qa-cursor');
    if (cursor) { cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; }
  }, [x, y]);
});
```

---

## Video Quality Standards

| Setting | Value | Rationale |
|---|---|---|
| Resolution | 1920×1080 | Standard HD, clear text |
| FPS | 30 | Smooth interaction, reasonable file size |
| Codec | H.264 | Universal browser/GitHub support |
| Container | MP4 | GitHub/Slack compatible |
| Max Duration | 5 minutes | Keep focused and reviewable |
| Max File Size | 50 MB | GitHub comment attachment limit |
| Bitrate | 2-4 Mbps | Good quality, reasonable size |

### ffmpeg Encoding Profile

```bash
ffmpeg -i raw.webm \
  -c:v libx264 \
  -preset medium \
  -crf 23 \
  -maxrate 4M \
  -bufsize 8M \
  -pix_fmt yuv420p \
  -movflags +faststart \
  -t 300 \
  output.mp4
```

---

## Post-Processing Pipeline

### Title Cards

Generated programmatically with Canvas API or ffmpeg:

```typescript
interface TitleCard {
  title: string;         // "Bug Reproduction"
  subtitle: string;      // "Issue #10688 — Sampler preview disappears"
  repo: string;          // "Comfy-Org/ComfyUI_frontend"
  timestamp: string;     // "2026-04-03"
  duration: number;      // 3 seconds
  background: string;    // "#1a1a2e"
  accentColor: string;   // "#00d9ff"
}
```

### Concatenation

For before/after videos, concatenate with transition:

```bash
# Create file list
echo "file 'title.mp4'" > list.txt
echo "file 'before.mp4'" >> list.txt
echo "file 'transition.mp4'" >> list.txt
echo "file 'after.mp4'" >> list.txt
echo "file 'endcard.mp4'" >> list.txt

ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
```

### Thumbnail Generation

Extract a representative frame for GitHub/Slack previews:

```bash
# Extract frame at 30% into the video
ffmpeg -i output.mp4 -ss 00:00:10 -vframes 1 thumbnail.png
```

---

## Storage & Delivery

### Upload Targets

1. **GitHub**: Attach to issue/PR comment (< 25MB via API, < 100MB via browser upload)
2. **Google Cloud Storage**: Primary storage for large videos (signed URLs, 14-day TTL)
3. **Slack**: Upload as file attachment to thread
4. **GitHub Actions Artifacts**: For CI-triggered runs (90-day retention)

### Storage Strategy

```typescript
async function uploadVideo(videoPath: string, context: QAContext): Promise<VideoUrls> {
  const fileSize = await getFileSize(videoPath);

  // Always upload to GCS for reliable hosting
  const gcsUrl = await uploadToGCS(videoPath, context.runId);

  // If small enough, also attach directly to GitHub
  let githubUrl: string | undefined;
  if (fileSize < 25 * 1024 * 1024) {
    githubUrl = await attachToGitHubComment(videoPath, context);
  }

  // Upload to Slack thread if triggered from Slack
  if (context.slackChannel) {
    await uploadToSlack(videoPath, context.slackChannel, context.slackThread);
  }

  return { gcsUrl, githubUrl };
}
```

### Cleanup Policy

- GCS artifacts: 14-day TTL (configurable)
- Local artifacts: Deleted after successful upload
- GitHub Actions artifacts: 90-day retention (GitHub default)
