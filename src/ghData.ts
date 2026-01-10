/**
 * Helper to fetch GitHub data using a provided fetch endpoint.
 *
 * @param fetchEndpoint - A function that fetches data from GitHub API.
 * @returns A function that takes parameters and returns the fetched data.
 *
 */
export function ghData<Params extends object & { page?: number; per_page?: number }, Item>(
  fetchEndpoint: (params?: Params) => Promise<{ data: Item }>,
): (params: Params) => Promise<Item> {
  return (params) => fetchEndpoint(params).then((res) => res.data);
}
