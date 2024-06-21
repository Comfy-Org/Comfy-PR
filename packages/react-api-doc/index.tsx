"use client";

import SwaggerUI, { type SwaggerUIProps } from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function ReactAPIDoc(props: SwaggerUIProps) {
  return <SwaggerUI {...props} />;
}
