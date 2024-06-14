import { getMAC } from "@ctrl/mac-address";
import md5 from "md5";
import type { WithId } from "mongodb";
import { createInstanceId } from "./createInstanceId";
import { db } from "./db";
import { fetchCurrentGeoInfo } from "./fetchCurrentGeoInfo";
export type GeoInfo = Awaited<ReturnType<typeof fetchCurrentGeoInfo>>;
export type WorkerInstance = {
  /** id: rand */
  id: string;
  up: Date;
  active: Date;
  geo: GeoInfo;
  workerId: string;
  task?: string;
};

const k = "COMFY_PR_WorkerInstanceKey";
type g = typeof globalThis & { [k]: any };
const instanceId = ((global as any as g)[k] ??= createInstanceId());

export const WorkerInstances = db.collection<WorkerInstance>("WorkerInstances");
await WorkerInstances.createIndex({ id: 1 }, { unique: true });
await WorkerInstances.createIndex({ ip: 1 });
export const _geoPromise = fetchCurrentGeoInfo(); // in background

if (import.meta.main) {
  await watchWorkerInstances();
}

(async function () {
  // heartbeat
  while (true) {
    await new Promise((r) => setTimeout(r, 15e3));
    await getWorkerInstance();
  }
})();

async function watchWorkerInstances() {
  const me = await getWorkerInstance();
  console.log("Worker instance ", me.id, " is watching for conflicts");
  for await (const event of WorkerInstances.watch([], {
    fullDocument: "whenAvailable",
  })) {
    const { fullDocument: updated } = event as typeof event & {
      fullDocument?: WithId<WorkerInstance>;
    };
    if (updated && updated.id !== me.id) {
      console.log("Another worker is updated", updated);
      if (+updated.up > +me.up && updated.task === me.task) {
        console.log("[EXIT] I'm outdated, new instance is: " + updated.id);
        process.exit(0);
      }
    }
  }
}

export async function getWorkerInstance(task?: string) {
  const id = getWorkerInstanceId();
  if (task) {
    console.log("Working on task: ", task);
  }
  return (await WorkerInstances.findOneAndUpdate(
    { id },
    {
      $set: {
        id,
        active: new Date(),
        workerId: getWorkerId(),
        geo: await _geoPromise,
        ...(task && { task }),
      },
      $setOnInsert: { up: new Date() },
    },
    { upsert: true, returnDocument: "after" },
  ))!;
}
export function getWorkerId() {
  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
  return md5(`SALT=v9yJQouMC22do66t ${hostname} ${getMAC()}`).slice(0, 8);
}
export function getWorkerInstanceId() {
  return instanceId;
}
