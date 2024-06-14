import { getMAC } from "@ctrl/mac-address";
import md5 from "md5";
import { db } from "./db";
import { fetchJson } from "./fetchJson";
export type Worker = {
  /**
   * id: hash of HOSTNAME & MAC address
   */
  id?: string;
  active?: Date;
  task?: string;
  geo: GeoInfo;
};
export const Worker = db.collection<Worker>("Worker");
await Worker.createIndex({ ip: 1 });
await Worker.createIndex({ hostname: 1 });
if (import.meta.main) {
  console.log(await getWorker());

  for await (const event of Worker.watch([],{fullDocument: 'whenAvailable'})) {
    console.log(event);
  }
}

export const _WorkerGeoPromise = updateWorkerGeo(); // in background

type GeoInfo = Awaited<ReturnType<typeof updateWorkerGeo>>;

async function updateWorkerGeo() {
  // - [IP-API.com - Geolocation API - Documentation - JSON]( https://ip-api.com/docs/api:json )
  const { query, city, iat, lon, countryCode, region } = (await fetchJson(
    "http://ip-api.com/json",
  )) as any;
  const geo = { ip: query, city, iat, lon, countryCode, region };
  await Worker.updateOne(
    { id: getWorkerId() },
    { $set: { geo } },
    { upsert: true },
  );
  return geo;
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
