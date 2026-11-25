// @ts-check

/**
 * Resolves audio links supplied by the server. A relative link is resolved
 * against the base URL that created the current SSE subscription.
 * @module audio-url
 */

/**
 * @param {string|null|undefined} audioUrl
 * @param {string} sseBaseUrl
 * @returns {string|null} An absolute HTTP(S) URL, or null when invalid.
 */
export function resolveAudioUrl(audioUrl, sseBaseUrl) {
  if (!audioUrl || typeof audioUrl !== "string") return null;
  const rawUrl = audioUrl.trim();
  if (!rawUrl) return null;

  try {
    if (/^https?:\/\//i.test(rawUrl)) {
      return new URL(rawUrl).toString();
    }
    if (rawUrl.startsWith("//")) {
      const protocol = new URL(sseBaseUrl).protocol;
      return new URL(`${protocol}${rawUrl}`).toString();
    }

    let baseHref = new URL(sseBaseUrl).toString();
    if (!rawUrl.startsWith("/") && !baseHref.endsWith("/")) {
      baseHref += "/";
    }
    const resolvedUrl = new URL(rawUrl, baseHref);
    if (!["http:", "https:"].includes(resolvedUrl.protocol)) return null;
    return resolvedUrl.toString();
  } catch {
    return null;
  }
}
