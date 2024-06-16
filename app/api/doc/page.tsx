import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import YAML from "yaml"
const spec = YAML.parse(await readFile("./src/api/spec.yaml", "utf8"));
export default function UIPage() {
  return <SwaggerUI spec={spec} />;
}
