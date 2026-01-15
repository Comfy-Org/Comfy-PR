/**
 * Helper to fetch GitHub data using a provided fetch endpoint.
 *
 * @param fetchEndpoint - A function that fetches data from GitHub API.
 * @returns A function that takes parameters and returns the fetched data.
 *
 * @deprecated use .then(e=>e.data) instead, because this function adds little value
 */
export function ghData<Params extends object & { page?: number; per_page?: number }, Item>(
  fetchEndpoint: (params?: Params) => Promise<{ data: Item }>,
): (params: Params) => Promise<Item> {
  return (params) => fetchEndpoint(params).then((res) => res.data);
}
