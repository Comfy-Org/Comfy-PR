import { createAuthClient } from "better-auth/react";

// Backward compatibility with NextAuth environment variables
// Priority: BETTER_AUTH_URL > NEXT_PUBLIC_APP_URL > NEXT_PUBLIC_VERCEL_URL > fallback
const getBaseURL = () => {
  // Better Auth specific env var
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  }

  // Standard app URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Vercel auto-provided URL
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }

  // During build time, use a placeholder URL
  // At runtime in production, this should be set via environment variables
  if (process.env.NODE_ENV === "production") {
    // Use a placeholder during build, will be overridden at runtime via env vars
    return "https://placeholder.vercel.app";
  }

  // Local development fallback
  return "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

export const { signIn, signOut, useSession } = authClient;
