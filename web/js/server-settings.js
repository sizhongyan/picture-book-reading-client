// @ts-check

/**
 * Reads and persists the server endpoint used by both HTTP and SSE requests.
 * @module server-settings
 */

import { SERVER_BASE_URL_STORAGE_KEY } from "./config.js";
import { applicationState } from "./state.js";

/**
 * Normalizes and stores a server base URL.
 * @param {string} rawBaseUrl
 * @returns {string}
 */
export function saveServerBaseUrl(rawBaseUrl) {
  const parsedUrl = new URL(rawBaseUrl.trim());
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("服务端地址只支持 http:// 或 https://");
  }
  const normalizedUrl = parsedUrl.toString().replace(/\/+$/, "");
  applicationState.serverBaseUrl = normalizedUrl;
  localStorage.setItem(SERVER_BASE_URL_STORAGE_KEY, normalizedUrl);
  return normalizedUrl;
}
