import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient, type Db } from "mongodb";

// Backward compatibility with NextAuth environment variables
const getAuthConfig = () => {
  // GitHub OAuth - support both AUTH_GITHUB_* and GITHUB_* (NextAuth style)
  const githubId = process.env.AUTH_GITHUB_ID || process.env.GITHUB_ID || "";
  const githubSecret = process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_SECRET || "";

  // Google OAuth - support both AUTH_GOOGLE_* and GOOGLE_* (NextAuth style)
  const googleId = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_ID || "";
  const googleSecret = process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_SECRET || "";

  // Base URL - support multiple env var names
  // Priority: BETTER_AUTH_URL > NEXT_PUBLIC_APP_URL > VERCEL_URL
  const baseURL =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  return {
    githubId,
    githubSecret,
    googleId,
    googleSecret,
    baseURL,
  };
};

const config = getAuthConfig();

// Create MongoDB client for Better Auth
// We use a separate singleton client to avoid issues with top-level await
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const mongoClient = new MongoClient(MONGODB_URI);

export const auth = betterAuth({
  database: mongodbAdapter(mongoClient.db() as Db),
  baseURL: config.baseURL,
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    github: {
      clientId: config.githubId,
      clientSecret: config.githubSecret,
      enabled: !!config.githubSecret,
    },
    google: {
      clientId: config.googleId,
      clientSecret: config.googleSecret,
      enabled: !!config.googleSecret,
    },
  },
  trustedOrigins: config.baseURL ? [config.baseURL] : [],
  // Add CORS configuration
  cors: {
    origin: true, // Allow all origins for now
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
});
