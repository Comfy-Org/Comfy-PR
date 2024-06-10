#!/usr/bin/env bun
import pMap from "p-map";
import { readFile, writeFile } from "fs/promises";
import { glob } from "zx";
import { writeToFile } from "rxdb/plugins/backup";
const files = await glob("node_modules/**/*instance*.js");
await pMap(files, async (file) => {
  const x = await readFile(file, "utf8");
  const y = x.replace(/console.warn/, ";");
  if (x !== y) {
    await writeFile(file, y);
    console.log("muted: " + file);
  }
});
console.log("done");
