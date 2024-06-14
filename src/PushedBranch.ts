import { makePublishcrBranch } from "./makePublishBranch";

export type PushedBranch = Awaited<ReturnType<typeof makePublishcrBranch>>;
