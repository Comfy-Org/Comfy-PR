import DIE from "@snomiao/die";

export const FORK_PREFIX =
  process.env.FORK_PREFIX?.replace(/"/g, "")?.trim() ||
  DIE('Missing env.FORK_PREFIX, if you want empty maybe try FORK_PREFIX=""');
