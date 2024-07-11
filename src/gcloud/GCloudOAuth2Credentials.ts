import DIE from "@snomiao/die";
import type { Credentials, OAuth2Client } from "google-auth-library";
import { uniq } from "rambda";
import { sf } from "snoflow";
import { db } from "../db";
import type { Awaitable } from "../types/Awaitable";
import { getAuthenticatedClient } from "./getAuthenticatedClient";
import { getOAuthTokenInfo } from "./getOAuthTokenInfo";
export const GCloudOAuth2Credentials = db.collection<{
  email: string;
  scopes: string[];
  fromUrl?: string;
  credentials?: Credentials;
}>("GCloudOAuth2");
export type RedirectFn = (url: string) => Awaitable<never>;
if (import.meta.main) {
  await sf(
    GCloudOAuth2Credentials.find({
      scopes: {
        $all: ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/userinfo.email"],
      },
    }),
  ).toLog();
}
/**
 * Get an scope authenticated GCloud OAuth2 Client (cached in db.GCloudOAuth2Credentials)
 *
 * If user email is not authorized for scopes, then authorize function will try redirect user to authorizeUrl
 * after the redirection, this function should DIEs.
 * and if user choosed continue, then they will be redirect to redirect_uri
 * We put a handler in the redirect_uri,
 * when the handleGCloudOAuth2Callback received tokens
 * parse email+scopes from token and store them into db
 * that will store into db.
 *
 * And finally you call getGCloudOAuth2Client again, got a valid client.
 */
export async function getGCloudOAuth2Client({
  email,
  scope = [],
  authorize,
  fromUrl,
}: {
  email: string;
  scope?: string | string[];
  authorize: (authorizeUrl: string) => Awaitable<never | string | Credentials>;
  fromUrl?: string;
}): Promise<OAuth2Client> {
  const scopes = uniq([...[scope].flat(), "https://www.googleapis.com/auth/userinfo.email"]);
  const auth = await getAuthenticatedClient({
    scope: scopes,
    authorize: async (authorizeUrl) => {
      fromUrl && (await GCloudOAuth2Credentials.updateOne({ email, scopes: { $all: scopes } }, { $set: { fromUrl } }));
      const cred = await GCloudOAuth2Credentials.findOne({
        email,
        scopes: { $all: scopes },
        credentials: { $exists: true },
      });
      if (cred?.credentials) return cred.credentials;
      return await authorize(authorizeUrl);
    },
  });
  if (+new Date() >= +(auth.credentials.expiry_date ?? 0)) {
    const credentials = (await auth.refreshAccessToken()).credentials;
    await GCloudOAuth2Credentials.findOneAndUpdate(
      { email, scopes: { $all: scopes } },
      { $set: { credentials } },
      { upsert: true },
    );
  }
  return auth;
}

/** Wait for callback code, and then save token to db */
export async function handleGCloudOAuth2Callback(req: Request, redirect?: RedirectFn) {
  const sp = new URL(req.url, "http://localhost").searchParams;
  const code = sp.get("code")?.toString() || DIE(new Error("MISSING CODE"));
  const auth = await getAuthenticatedClient({ authorize: () => code });
  const info = await getOAuthTokenInfo(auth);
  if (!info.email_verified) return new Response("Error: Email not verified", { status: 401 });
  const { email, scopes } = info;
  const credentials = auth.credentials;
  const cred = await GCloudOAuth2Credentials.findOneAndUpdate(
    { email, scopes }, // [ "https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/userinfo.email", "openid" ],
    { $set: { credentials, scopes } },
    { upsert: true, returnDocument: "after" },
  );
  cred?.fromUrl && (await redirect?.(cred.fromUrl)); // redirect user back if possible
  return new Response(`Authentication for ${email} was successful!`);
}
