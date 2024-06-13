import Keyv from "keyv";
import { KeyvCachedWith } from "keyv-cached-with";
import { KeyvDirStore } from "keyv-dir-store";

// local cache for 15min
const store = new KeyvDirStore(".cache/fetchJson");
const kv = new Keyv({ store: store, ttl: 15 * 60e3 });
const CachedWith = KeyvCachedWith(kv);
async function fetcher<T>(url: string) {
  console.log("Fetching ", url);
  return await fetch(url).then((e) => e.json() as T);
}
export const fetchJson = CachedWith(fetcher) as typeof fetcher;
