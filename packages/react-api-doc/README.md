# react-api-doc

Swagger UI without needing node-gyp installed

## Usages in NextJS 14

```ts
import dynamic from "next/dynamic";
import { spec } from "./spec";
const APIDoc = dynamic(() => import("react-api-doc"), { ssr: false });
export default async function ReactApiDocPage() {
  return <APIDoc spec={spec} />;
}
```
