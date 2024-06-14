import { getMAC } from "@ctrl/mac-address";
import md5 from "md5";
import { db } from "./db";
import { fetchCurrentGeoInfo } from "./fetchCurrentGeoInfo";
export type GeoInfo = Awaited<ReturnType<typeof fetchCurrentGeoInfo>>;
export type Worker = {
  /**
   * id: hash of HOSTNAME & MAC address
   */
  id?: string;
  active?: Date;
  task?: string;
  geo: GeoInfo;
  instancesIds?: string[]; // not _id
};
export type WorkerInstance = {
  /** id: rand */
  id?: string;
  active?: Date;
  task?: string;
  geo?: GeoInfo;
};
const _WorkerInstanceId = Math.random().toString(36).slice(2);
export const Workers = db.collection<Worker>("Workers");
export const WorkerInstances = db.collection<WorkerInstance>("WorkerInstances");
await Workers.createIndex({ ip: 1 });
await Workers.createIndex({ hostname: 1 });
if (import.meta.main) {
  console.log(await getWorker());
  for await (const event of Workers.watch([], {
    fullDocument: "whenAvailable",
  })) {
    console.log(event);
  }
}

export const _WorkerGeoPromise = updateWorkerGeo(); // in background

async function updateWorkerGeo() {
  // - [IP-API.com - Geolocation API - Documentation - JSON]( https://ip-api.com/docs/api:json )
  const geo = await fetchCurrentGeoInfo();
  await Workers.updateOne(
    { id: getWorkerId() },
    { $set: { geo } },
    { upsert: true },
  );
  return geo;
}
export async function getWorker(task?: string) {
  await updateWorkerGeo();
  const instance = getWorkerInstanceId();
  const worker = await Workers.findOneAndUpdate(
    { id: getWorkerId() },
    {
      $set: { active: new Date(), ...(task && { task }) },
      $addToSet: { instancesIds: instance },
    },
    { upsert: true },
  );
  return worker!;
}

export function getWorkerId() {
  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
  return md5(`SALT=v9yJQouMC22do66t ${hostname} ${getMAC()}`).slice(0, 8);
}
export function getWorkerInstanceId() {
  return _WorkerInstanceId;
}
