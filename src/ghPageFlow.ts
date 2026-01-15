import type sflow from "sflow";
import { pageFlow } from "sflow";

/**
 * Helper to paginate through GitHub API endpoints that support pagination.
 *
 * @param listEndpoint The GitHub API endpoint function that returns a paginated list.
 * @returns A function that takes the same parameters as the endpoint (excluding pagination parameters)
 *
 * @example
 * const flow = ghPaged(ghc.pulls.listCommentsForReview)({ owner: "snomiao", repo: "ComfyNode-Registry-test", pull_number: 1, review_id: 1 })
 * const allComments = flow.toArray()
 *
 * @see https://docs.github.com/en/rest/guides/traversing-with-pagination
 *
 * @template Params The type of parameters accepted by the GitHub API endpoint.
 * @template Item The type of items returned by the GitHub API endpoint.
 *
 * @author snomiao <snomiao@gmail.com>
 */

export function ghPageFlow<Params extends object & { page?: number; per_page?: number }, Item>(
  listEndpoint: (params?: Params) => Promise<{ data: Item[] }>,
  // options
  { per_page = 100, startPage = 1 } = {},
): (params: Params & { page?: never; per_page?: never }) => sflow<Item> {
  return (params) =>
    pageFlow(startPage, async (page) => {
      const { data } = await listEndpoint({ ...params, page, per_page });

      return { data, next: data.length >= per_page ? page + 1 : null };
    }).flat();
}
