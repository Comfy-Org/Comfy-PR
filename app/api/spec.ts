import { writeFile } from "fs/promises";
import http from "http";
import { createOpenApiHttpHandler, generateOpenApiDocument } from "trpc-openapi";
import YAML from "yaml";
import { router } from "./router";
export const spec = generateOpenApiDocument(router, {
  title: "ComfyPR OpenAPI",
  version: "1.0.0",
  baseUrl: "/api",
});
if (import.meta.main) {
  const server = http.createServer(createOpenApiHttpHandler({ router } as any));
  server.listen(8200);
  await writeFile("./app/api/spec.yaml", YAML.stringify(spec));
  console.log("hello");
}
