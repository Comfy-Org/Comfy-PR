import { makePublishBranch } from "./makePublishBranch";

export type PushedBranch = Awaited<ReturnType<typeof makePublishBranch>>;
