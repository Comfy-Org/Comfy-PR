import dynamic from "next/dynamic";
import { spec } from "./spec";
const APIDoc = dynamic(() => import("packages/react-api-doc/dist/index"), { ssr: false });
export default async function PRCommentsPage() {
  return <APIDoc spec={spec} />;
}
