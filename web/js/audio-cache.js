// @ts-check

/**
 * Audio resource lifecycle management. Every stop path cancels in-flight work,
 * unloads the media element, revokes Blob URLs, and clears both queues.
 * @module audio-cache
 */

import { AUDIO_CACHE_STORAGE_KEY } from "./config.js";
import { applicationState } from "./state.js";
import { appendLog, setPlaybackStatus, updateQueueStatistics } from "./ui.js";

/**
 * Revokes one Blob URL if it is still tracked.
 * @param {string} blobUrl
 * @returns {boolean} Whether the URL was revoked.
 */
export function releaseBlobUrl(blobUrl) {
  if (!blobUrl) return false;
  URL.revokeObjectURL(blobUrl);
  applicationState.activeBlobUrls.delete(blobUrl);
  return true;
}

/**
 * Invalidates all asynchronous audio work and clears visible audio state.
 * @param {string} [statusText="音频已停止，等待新音频..."]
 * @returns {number} Number of revoked Blob URLs.
 */
export function stopAudioPipeline(statusText = "音频已停止，等待新音频...") {
  applicationState.downloadRunId += 1;
  applicationState.playbackRunId += 1;
  applicationState.isDownloading = false;
  applicationState.isPlaying = false;

  if (applicationState.downloadAbortController) {
    applicationState.downloadAbortController.abort();
    applicationState.downloadAbortController = null;
  }

  if (applicationState.resolveCurrentPlayback) {
    const resolvePlayback = applicationState.resolveCurrentPlayback;
    applicationState.resolveCurrentPlayback = null;
    resolvePlayback("cancelled");
  }

  /** @type {HTMLAudioElement} */
  const audioElement = /** @type {HTMLAudioElement} */ (
    document.getElementById("htmlAudioPlayer")
  );
  audioElement.pause();
  audioElement.onended = null;
  audioElement.onerror = null;
  audioElement.removeAttribute("src");
  audioElement.load();

  applicationState.downloadQueue.length = 0;
  applicationState.playbackQueue.length = 0;

  let revokedCount = 0;
  for (const blobUrl of applicationState.activeBlobUrls) {
    URL.revokeObjectURL(blobUrl);
    revokedCount += 1;
  }
  applicationState.activeBlobUrls.clear();
  localStorage.removeItem(AUDIO_CACHE_STORAGE_KEY);

  setPlaybackStatus(statusText, false, true);
  updateQueueStatistics();
  return revokedCount;
}

/**
 * Clears all audio state for a manual action or application startup.
 * @param {boolean} [isManual=false]
 * @returns {void}
 */
export function clearAllAudioCache(isManual = false) {
  applicationState.dispatchedAudioUrls.clear();
  const revokedCount = stopAudioPipeline(
    isManual ? "已清空音频缓存和队列" : "音频播放器已就绪",
  );

  if (isManual || revokedCount > 0) {
    appendLog(
      `🧹 [缓存清理]: 已释放 ${revokedCount} 个残留音频缓存并清空队列。`,
      "success",
    );
  } else {
    appendLog("✨ [启动自检]: 本地音频缓存区干净，无残留音频文件。", "info");
  }
}
