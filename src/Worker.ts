import { getMAC } from "@ctrl/mac-address";
import md5 from "md5";
import { db } from "./db";
export type Worker = {
  /**
   * id: hash of HOSTNAME & MAC address
   */
  id?: string;
  active?: Date;
  task?: string;
} & GeoInfo;
export const Worker = db.collection<Worker>("Worker");
await Worker.createIndex({ ip: 1 });
await Worker.createIndex({ hostname: 1 });
if (import.meta.main) {
  console.log(await getWorker());
}

export const _WorkerGeoPromise = updateWorkerGeo(); // in background

type GeoInfo = ReturnType<Awaited<typeof updateWorkerGeo>>;

async function updateWorkerGeo() {
  // - [IP-API.com - Geolocation API - Documentation - JSON]( https://ip-api.com/docs/api:json )
  const { query, city, iat, lon, countryCode, region } = await (
    await fetch("http://ip-api.com/json")
  ).json();
  const ipInfo = { ip: query, city, iat, lon, countryCode, region };
  await Worker.updateOne(
    { id: getWorkerId() },
    { $set: ipInfo },
    { upsert: true },
  );
  return ipInfo;
}

export async function getWorker(task?: string) {
  await updateWorkerGeo();
  const worker = await Worker.findOneAndUpdate(
    { id: getWorkerId() },
    { $set: { active: new Date(), ...(task && { task }) } },
    { upsert: true },
  );
  return worker!;
}

function getWorkerId() {
  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
  return md5(`SALT=v9yJQouMC22do66t ${hostname} ${getMAC()}`).slice(0, 8);
}
