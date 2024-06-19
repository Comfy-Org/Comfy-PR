import {CachedWith} from './CachedWith';
async function fetcher<T>(url: string) {
  console.log(`[INFO] Fetching ${url}`);
  return await fetch(url).then((e) => e.json() as T);
}
export const fetchJson = CachedWith(fetcher) as typeof fetcher;
