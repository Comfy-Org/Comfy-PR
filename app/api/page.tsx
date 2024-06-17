// import yaml from "yaml";
// const spec = yaml.parse(await readFile("./app/api/spec.yaml", "utf8"));
import { spec } from "./spec";

// crash in node 20
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

// missing lodash-es even after import by manual
// import 'lodash-es'
// import { BadMagic } from "badmagic";

// missing types:
// import { API } from '@stoplight/elements';
// import '@stoplight/elements/styles.min.css';

export default function UIPage() {
  // return <>WIP</>;
  return <SwaggerUI spec={spec} />;
  // return <BadMagic workspaces={[spec]} />;
  // return <API apiDescriptionUrl="./openapi.yaml" />;
}
