import { readFile } from "fs/promises";
// import SwaggerUI from "swagger-ui-react";
// import "swagger-ui-react/swagger-ui.css";
// import 'lodash-es'
// import { BadMagic } from "badmagic";
import yaml from "yaml";
const spec = yaml.parse(await readFile("./app/api/spec.yaml", "utf8"));
export default function UIPage() {
  return <>WIP</>;
  // return <BadMagic workspaces={[spec]} />;
  // return <SwaggerUI spec={spec} />;
}
