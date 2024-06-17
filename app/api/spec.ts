import { generateOpenApiDocument } from "trpc-openapi";
import YAML from "yaml";
import { router } from "./router";
export const spec = generateOpenApiDocument(router, {
  title: "ComfyPR OpenAPI",
  version: "1.0.0",
  baseUrl: "/api",
});
if (import.meta.main) {
  console.log(YAML.stringify(spec));
}
