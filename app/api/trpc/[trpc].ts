import { router } from "@/src/api/router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: router,
    createContext: () => ({
      user: null,
    }),
  });
}
export { handler as GET, handler as POST };
