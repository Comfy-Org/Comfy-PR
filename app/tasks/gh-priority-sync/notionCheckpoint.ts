export type NotionScanCheckpoint = {
  id?: string;
  editedAt?: string;
  processedIdsAtEditedAt?: string[];
};

type NotionPageBoundary = {
  id: string;
  last_edited_time: string;
};

export function getNotionCheckpointFilter(checkpoint?: NotionScanCheckpoint) {
  if (!checkpoint?.editedAt) return [];

  return [
    {
      timestamp: "last_edited_time" as const,
      last_edited_time: { on_or_after: checkpoint.editedAt },
    },
  ];
}

function getProcessedIdsAtBoundary(checkpoint?: NotionScanCheckpoint) {
  return new Set(checkpoint?.processedIdsAtEditedAt ?? (checkpoint?.id ? [checkpoint.id] : []));
}

export function wasProcessedAtCheckpointBoundary(
  page: NotionPageBoundary,
  checkpoint?: NotionScanCheckpoint,
) {
  return (
    page.last_edited_time === checkpoint?.editedAt &&
    getProcessedIdsAtBoundary(checkpoint).has(page.id)
  );
}

export function advanceNotionCheckpoint(
  checkpoint: NotionScanCheckpoint | undefined,
  page: NotionPageBoundary,
): NotionScanCheckpoint {
  const processedIds =
    checkpoint?.editedAt === page.last_edited_time
      ? getProcessedIdsAtBoundary(checkpoint)
      : new Set<string>();

  processedIds.add(page.id);

  return {
    id: page.id,
    editedAt: page.last_edited_time,
    processedIdsAtEditedAt: [...processedIds],
  };
}
