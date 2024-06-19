import Keyv from "keyv";
import { KeyvCachedWith } from "keyv-cached-with";
// import { KeyvDirStore } from "keyv-dir-store";

// local cache for 15min
const kv = new Keyv({
  ttl: 15 * 60e3,
  // comment to use in-memory cache
  // store: new KeyvDirStore(".cache/fetchJson"),
  // serialize: KeyvDirStore.serialize,
  // deserialize: KeyvDirStore.deserialize,
});
export const CachedWith = KeyvCachedWith(kv);
