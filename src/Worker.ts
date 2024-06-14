import { getMAC } from "@ctrl/mac-address";
import md5 from "md5";
import { db } from "./db";
import { fetchCurrentGeoInfo } from "./fetchCurrentGeoInfo";
export type GeoInfo = Awaited<ReturnType<typeof fetchCurrentGeoInfo>>;
export type WorkerInstance = {
  /** id: rand */
  id?: string;
  workerId?: string;
  up?: Date;
  active?: Date;
  task?: string;
  geo?: GeoInfo;
};
const _WorkerInstanceId = Math.random().toString(36).slice(2);
export const WorkerInstances = db.collection<WorkerInstance>("WorkerInstances");
await WorkerInstances.createIndex({ id: 1 }, { unique: true });
await WorkerInstances.createIndex({ ip: 1 });
export const _geoPromise = fetchCurrentGeoInfo(); // in background

if (import.meta.main) {
  console.log(await getWorkerInstance());
  for await (const event of WorkerInstances.watch([], {
    fullDocument: "whenAvailable",
  })) {
    console.log(event);
  }
}

export async function getWorkerInstance(task?: string) {
  const id = getWorkerInstanceId();
  return await WorkerInstances.findOneAndUpdate(
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
    { upsert: true , returnDocument: "after" },
  );
}
export function getWorkerId() {
  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
  return md5(`SALT=v9yJQouMC22do66t ${hostname} ${getMAC()}`).slice(0, 8);
}
export function getWorkerInstanceId() {
  return _WorkerInstanceId;
}
