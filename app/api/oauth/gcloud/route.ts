import { handleGCloudOAuth2Callback } from "@/src/gcloud/GCloudOAuth2Credentials";
import { redirect } from "next/navigation";

export const GET = (req: Request) => handleGCloudOAuth2Callback(req, (url) => redirect(url)); // redirect if fromURL provided
