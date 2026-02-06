/**
 * Creates a lazy proxy that defers the instantiation of an object until one of its properties or methods is accessed.
 *
 * Handy when exporting apis for nextjs server-side code needs to create objects that depend on environment variables,
 * but those environment variables are only available at runtime.
 *
 * @template T The type of the object to be proxied.
 * @param fn A function that returns the object to be proxied.
 * @returns A proxy object that lazily initializes the target object.
 *
 * @example
 * ```ts
 * import DIE from "@snomiao/die";
 * export const lazyObj = lazyProxy(() => {
 *   console.log("Object created");
 *   process.env.MY_ENV_VAR || DIE("Missing MY_ENV_VAR");
 *   return { greet: () => "Hello, World!" };
 * });
 *
 * // At this point, the object is not yet created. Accessing a property will trigger its creation.
 *
 * console.log("Before accessing property");
 * console.log(lazyObj.greet()); // Logs "Object created" followed by "Hello, World!"
 *
 * ```
 *
 * @author snomiao <snomiao@gmail.com>
 */
export function lazyInstantiate<T>(fn: () => T): T {
  let cached: T | null = null;
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (cached === null) {
          cached = fn();
        }
        return (cached as Record<string, unknown>)[prop];
      },
      apply(_, __, args) {
        if (cached === null) {
          cached = fn();
        }
        return (cached as Record<string, unknown>)(...args);
      },
    },
  ) as T;
}
