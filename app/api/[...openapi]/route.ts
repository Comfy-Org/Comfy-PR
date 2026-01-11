import { createOpenApiFetchHandler } from "trpc-to-openapi";
import { router } from "../router";
export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };

async function handler(req: Request): Promise<Response> {
  return await createOpenApiFetchHandler({
    router,
    endpoint: "/api",
    createContext: () => ({}), // can add user auth
    req,
  });
}
