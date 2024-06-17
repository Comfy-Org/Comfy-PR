import { testApiBase } from "./testApiBase";

export const isTestApiUp = await fetch(testApiBase + '/version')
  .then(() => true)
  .catch(() => {
    console.error("Nextjs Server is not running, skip api tests, run `bun dev` to start server for api tests");
    return null;
  });
