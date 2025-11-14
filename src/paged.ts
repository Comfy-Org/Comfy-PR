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
 */

export function ghPaged<
	Params extends object & { page?: number; per_page?: number },
	Item,
>(
	listEndpoint: (params?: Params) => Promise<{ data: Item[] }>,
): (params: Params & { page?: never; per_page?: never }) => sflow<Item> {
	return (params) =>
		pageFlow(1, async (page, per_page = 100) => {
			const { data } = await listEndpoint({ ...params, page, per_page });
      
			return { data, next: data.length >= per_page ? page + 1 : null };
		}).flat();
}
