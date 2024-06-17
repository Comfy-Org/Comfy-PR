"use client";

// crash in node 20
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

// missing lodash-es even after import by manual
// import 'lodash-es'
// import { BadMagic } from "badmagic";

// missing types:
// import { API } from '@stoplight/elements';
// import '@stoplight/elements/styles.min.css';

export default function APIDoc({ spec }: { spec: any }) {
  // return <>WIP</>;
  return <SwaggerUI spec={spec} />;
  // return <BadMagic workspaces={[spec]} />;
  // return <API apiDescriptionUrl="./openapi.yaml" />;
}
