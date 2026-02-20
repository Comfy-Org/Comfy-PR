import DIE from "@snomiao/die";
import { type Credentials } from "google-auth-library";
import { google } from "googleapis";
import type { Awaitable } from "../types/Awaitable";

/**
 * Create a new OAuth2Client, and go through the OAuth2 content
 * workflow.
 * Return the full client.
 */
export async function getAuthenticatedClient({
  scope,
  // redirect_uri,
  authorize,
}: {
  // redirect_uri?: string;
  authorize: {
    /**
     * return Credentials: tokens
     * return string: code from callback handler
     * return never: redirect away
     */
    (authorizeUrl: string): Awaitable<Credentials | string | never>;
  };
  /**
   * @example
   * "https://www.googleapis.com/auth/calendar"
   * 'https://www.googleapis.com/auth/userinfo.profile'
   */
  scope?: string | string[];
}) {
  // create an oAuth client to authorize the API call.  Secrets are kept in a `keys.json` file,
  // which should be downloaded from the Google Developers Console.
  const getOAuth2Client = () =>
    new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID || DIE`MISSING env.AUTH_GOOGLE_ID`,
      process.env.AUTH_GOOGLE_SECRET || DIE`MISSING env.AUTH_GOOGLE_SECRET`,
      getGCloudOAuth2RedirectUri(),
    );
  // Generate the url that will be used for the consent dialog.
  const authorizeUrl = getOAuth2Client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // for refresh_token
    scope,
  });
  // console.log(authorizeUrl);
  const cred = await authorize(authorizeUrl);
  if (typeof cred === "string") {
    const code = cred;
    // console.log("fetching token");
    const tokens = (await getOAuth2Client().getToken(code)).tokens;
    // console.log("got token ", tokens);
    const oAuth2Client = getOAuth2Client();
    if (!tokens.access_token) DIE("missing access_token");
    if (!tokens.refresh_token) DIE("missing refresh_token");
    oAuth2Client.setCredentials(tokens);
    return oAuth2Client;
  }
  if (typeof cred === "object") {
    const tokens = cred;
    // console.log("got token ", tokens);
    const oAuth2Client = getOAuth2Client();
    if (!tokens.access_token) DIE("missing access_token");
    if (!tokens.refresh_token) DIE("missing refresh_token");
    oAuth2Client.setCredentials(tokens);
    return oAuth2Client;
  }
  throw "fail to parse cred " + JSON.stringify(cred);
}

export function getGCloudOAuth2RedirectUri(): string {
  return `${
    new URL(
      process.env.AUTH_GCLOUD_URL ??
        process.env.AUTH_URL ??
        process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ??
        DIE`\
Missding env.API_AUTH_URL, \
Please choose one from web.keys.redirect_uris \
And fill API_AUTH_URL into .env.local.
Make sure path has "/api/oauth/gcloud"
`,
    ).origin
  }/api/oauth/gcloud`;
}
