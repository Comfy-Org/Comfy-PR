import { initTRPC } from "@trpc/server";
import { createOpenApiHttpHandler, type OpenApiMeta } from "trpc-openapi";
export const t = initTRPC.meta<OpenApiMeta>().create(); /* 👈 */

import { generateOpenApiDocument } from "trpc-openapi";

export const openApiDocument = generateOpenApiDocument(router, {
  title: "ComfyPR OpenAPI",
  version: "1.0.0",
  baseUrl: "http://localhost:8200",
});

import { writeFile } from "fs/promises";
import http from "http";
import YAML from "yaml";
import { router } from "./router";
const server = http.createServer(createOpenApiHttpHandler({ router } as any));
server.listen(8200);
await writeFile("src/api/spec.yaml", YAML.stringify(openApiDocument));
console.log("hello");
