/**
 * Normalize GitHub URLs to use the canonical Comfy-Org organization name
 *
 * This ensures that URLs pointing to the same resource but with different
 * organization names (comfyanonymous vs Comfy-Org) are treated as identical.
 *
 * @param url - GitHub URL to normalize
 * @returns Normalized URL with comfyanonymous replaced by Comfy-Org
 *
 * @example
 * normalizeGithubUrl("https://github.com/comfyanonymous/ComfyUI/issues/123")
 * // => "https://github.com/Comfy-Org/ComfyUI/issues/123"
 *
 * normalizeGithubUrl("https://github.com/Comfy-Org/ComfyUI/issues/123")
 * // => "https://github.com/Comfy-Org/ComfyUI/issues/123"
 */
export function normalizeGithubUrl(url: string): string {
  if (!url) return url;

  // Only ComfyUI was migrated from comfyanonymous to Comfy-Org
  return url.replace(
    /github\.com\/comfyanonymous\/ComfyUI([/?#]|$)/gi,
    "github.com/Comfy-Org/ComfyUI$1",
  );
}

/**
 * Normalize multiple GitHub URLs at once
 *
 * @param urls - Array of GitHub URLs to normalize
 * @returns Array of normalized URLs
 */
export function normalizeGithubUrls(urls: string[]): string[] {
  return urls.map(normalizeGithubUrl);
}

/**
 * Normalize GitHub URLs in an object's properties
 *
 * @param obj - Object containing URL properties
 * @param urlFields - Array of field names that contain URLs
 * @returns New object with normalized URLs
 *
 * @example
 * normalizeGithubUrlsInObject(
 *   { sourceIssueUrl: "https://github.com/comfyanonymous/ComfyUI/issues/123" },
 *   ["sourceIssueUrl"]
 * )
 * // => { sourceIssueUrl: "https://github.com/Comfy-Org/ComfyUI/issues/123" }
 */
export function normalizeGithubUrlsInObject<T extends Record<string, unknown>>(
  obj: T,
  urlFields: (keyof T)[],
): T {
  const result = { ...obj };

  for (const field of urlFields) {
    if (typeof result[field] === "string") {
      result[field] = normalizeGithubUrl(result[field] as string) as T[keyof T];
    }
  }

  return result;
}
