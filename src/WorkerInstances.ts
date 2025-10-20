import { getMAC } from "@ctrl/mac-address";
import { defer } from "lodash-es";
import md5 from "md5";
import type { WithId } from "mongodb";
import sflow from "sflow";
import { $fresh, db } from "./db";
import { fetchCurrentGeoInfo } from "./fetchCurrentGeoInfo";
import { createInstanceId } from "./utils/createInstanceId";
import { yaml } from "./utils/yaml";

export type GeoInfo = Awaited<ReturnType<typeof fetchCurrentGeoInfo>>;
export type WorkerInstance = {
  /** id: rand */
  id: string;
  up: Date;
  active: Date;
  geo: GeoInfo;
  workerId: string;
  task?: string;
  tasks?: string[];
};

const k = "COMFY_PR_WorkerInstanceKey";
const g = globalThis as typeof globalThis & { [k]: string };
function getWorkerInstanceId() {
  // ensure only one instance
  if (!g[k])
    defer(async function () {
      await Promise.all([postWorkerHeartBeatLoop(), watchWorkerInstancesLoop()]);
    });
  const instanceId = (g[k] ??= createInstanceId());
  return instanceId;
}
export const WorkerInstances = db.collection<WorkerInstance>("WorkerInstances");
let _geoPromise: Promise<GeoInfo> | undefined;
function getGeoPromise() {
  if (!_geoPromise) {
    _geoPromise = fetchCurrentGeoInfo();
  }
  return _geoPromise;
}

if (import.meta.main) {
  await WorkerInstances.createIndex({ id: 1 }, { unique: true });
  await WorkerInstances.createIndex({ ip: 1 });
  console.log(await getWorkerInstance());
  console.log(
    await sflow(
      WorkerInstances.watch([{ $match: { up: $fresh("5min") } }], {
        fullDocument: "whenAvailable",
      }),
    )
      .map((e) => yaml.stringify(e))
      .log()
      .run(),
  );
}

async function postWorkerHeartBeatLoop() {
  // 30s heartbeat
  while (true) {
    await new Promise((r) => setTimeout(r, 30e3));
    await getWorkerInstance();
  }
}

async function watchWorkerInstancesLoop() {
  const me = await getWorkerInstance();
  console.log("[INIT] Worker instance " + me.id + " is up.");
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
        geo: await getGeoPromise(),
        ...(task && { task }),
      },
      $addToSet: {
        ...(task && { tasks: task }),
      },
      $setOnInsert: { up: new Date() },
    },
    { upsert: true, returnDocument: "after" },
  ))!;
}
function getWorkerId() {
  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME;
  return md5(`SALT=v9yJQouMC22do66t ${hostname} ${getMAC()}`).slice(0, 8);
}
