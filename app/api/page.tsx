import dynamic from "next/dynamic";
import "react-api-doc/dist/index.css";
import { spec } from "./spec";

const APIDoc = dynamic(() => import("react-api-doc"), { ssr: false });
export default async function PRCommentsPage() {
  return <APIDoc spec={spec} />;
}
