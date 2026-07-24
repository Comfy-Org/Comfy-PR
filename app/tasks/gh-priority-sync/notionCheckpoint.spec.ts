import { describe, expect, it } from "bun:test";
import {
  advanceNotionCheckpoint,
  getNotionCheckpointFilter,
  wasProcessedAtCheckpointBoundary,
} from "./notionCheckpoint";

describe("Notion priority-sync checkpoints", () => {
  it("resumes with a last_edited_time filter instead of a persisted cursor", () => {
    expect(
      getNotionCheckpointFilter({
        id: "page-1",
        editedAt: "2026-07-24T15:00:00.000Z",
      }),
    ).toEqual([
      {
        timestamp: "last_edited_time",
        last_edited_time: { on_or_after: "2026-07-24T15:00:00.000Z" },
      },
    ]);
    expect(getNotionCheckpointFilter()).toEqual([]);
  });

  it("upgrades legacy checkpoints and skips their boundary page", () => {
    const checkpoint = {
      id: "page-1",
      editedAt: "2026-07-24T15:00:00.000Z",
    };

    expect(
      wasProcessedAtCheckpointBoundary(
        { id: "page-1", last_edited_time: "2026-07-24T15:00:00.000Z" },
        checkpoint,
      ),
    ).toBe(true);
    expect(
      wasProcessedAtCheckpointBoundary(
        { id: "page-2", last_edited_time: "2026-07-24T15:00:00.000Z" },
        checkpoint,
      ),
    ).toBe(false);
  });

  it("tracks every processed page that shares the boundary timestamp", () => {
    const first = advanceNotionCheckpoint(undefined, {
      id: "page-1",
      last_edited_time: "2026-07-24T15:00:00.000Z",
    });
    const second = advanceNotionCheckpoint(first, {
      id: "page-2",
      last_edited_time: "2026-07-24T15:00:00.000Z",
    });

    expect(second.processedIdsAtEditedAt).toEqual(["page-1", "page-2"]);
  });

  it("resets boundary IDs when the edited timestamp advances", () => {
    const checkpoint = advanceNotionCheckpoint(
      {
        id: "page-1",
        editedAt: "2026-07-24T15:00:00.000Z",
        processedIdsAtEditedAt: ["page-1"],
      },
      {
        id: "page-2",
        last_edited_time: "2026-07-24T16:00:00.000Z",
      },
    );

    expect(checkpoint).toEqual({
      id: "page-2",
      editedAt: "2026-07-24T16:00:00.000Z",
      processedIdsAtEditedAt: ["page-2"],
    });
  });
});
