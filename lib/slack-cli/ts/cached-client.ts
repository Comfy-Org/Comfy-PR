import type { WebClient } from "@slack/web-api";

export interface CachedSlackOptions {
  ttl?: number;
}

interface CacheEntry {
  value: unknown;
  expiry: number;
}

export function createCachedSlack(client: WebClient, opts: CachedSlackOptions = {}): WebClient {
  const ttl = opts.ttl ?? 300_000;
  const cache = new Map<string, CacheEntry>();

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      const val = (target as Record<string, unknown>)[prop];
      if (typeof val === "function") {
        return (...args: unknown[]) => {
          const key = `${prop}(${JSON.stringify(args)})`;
          const now = Date.now();
          const cached = cache.get(key);
          if (cached && cached.expiry > now) return Promise.resolve(cached.value);
          const result = (val as Function).apply(target, args);
          if (result && typeof (result as Promise<unknown>).then === "function") {
            return (result as Promise<unknown>).then((v: unknown) => {
              cache.set(key, { value: v, expiry: now + ttl });
              return v;
            });
          }
          cache.set(key, { value: result, expiry: now + ttl });
          return result;
        };
      }
      if (val && typeof val === "object") {
        return new Proxy(val as Record<string, unknown>, handler);
      }
      return val;
    },
  };

  return new Proxy(client as unknown as Record<string, unknown>, handler) as unknown as WebClient;
}
