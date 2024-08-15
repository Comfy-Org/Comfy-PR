import DIE from "@snomiao/die";
import type { OAuth2Client } from "google-auth-library";

export async function getOAuthTokenInfo(auth: OAuth2Client) {
  const userInfo =
    (
      await auth.verifyIdToken({
        idToken: auth.credentials.id_token!,
        audience: auth._clientId,
      })
    ).getPayload() ?? DIE("MISSING OAUTH JWT");

  // After acquiring an access_token, you may want to check on the audience, expiration,
  // or original scopes requested.  You can do that with the `getTokenInfo` method.
  const tokenInfo = await auth.getTokenInfo(auth.credentials.access_token!);
  return { ...tokenInfo, ...userInfo };
}
