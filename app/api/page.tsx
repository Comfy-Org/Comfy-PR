import dynamic from "next/dynamic";
import { spec } from "./spec";
const APIDoc = dynamic(() => import("./APIDoc"), { ssr: false });
export default async function PRCommentsPage() {
  return <APIDoc spec={spec} />;
}
