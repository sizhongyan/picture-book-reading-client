// @ts-check

/**
 * Sequential download and playback workers. Generation identifiers prevent
 * stale asynchronous work from mutating a newer page or book session.
 * @module audio-workers
 */

import { releaseBlobUrl } from "./audio-cache.js";
import { enqueuePlayback } from "./audio-queue.js";
import { applicationState } from "./state.js";
import {
  appendLog,
  setPlaybackStatus,
  updateQueueStatistics,
} from "./ui.js";

/** @typedef {import("./types.js").PlaybackTrack} PlaybackTrack */

/** @type {PlaybackTrack|null} */
let activePlaybackTrack = null;

/**
 * Retrieves the single HTML audio element used by the application.
 * @returns {HTMLAudioElement}
 */
function getAudioElement() {
  return /** @type {HTMLAudioElement} */ (
    document.getElementById("htmlAudioPlayer")
  );
}

/**
 * Completes the active playback promise exactly once.
 * @param {string} outcome
 * @returns {void}
 */
function completeCurrentPlayback(outcome) {
  const resolvePlayback = applicationState.resolveCurrentPlayback;
  applicationState.resolveCurrentPlayback = null;
  const audioElement = getAudioElement();
  audioElement.onended = null;
  audioElement.onerror = null;
  if (resolvePlayback) resolvePlayback(outcome);
}

/** @returns {void} */
function handleAudioEnded() {
  completeCurrentPlayback("ended");
}

/** @returns {void} */
function handleAudioError() {
  if (activePlaybackTrack) {
    appendLog(
      `⚠️ [音频解码异常] 跳过片段: ${activePlaybackTrack.sequenceIdentifier}`,
      "warn",
    );
  }
  completeCurrentPlayback("error");
}

/**
 * @param {Error} error
 * @returns {void}
 */
function handlePlayRejected(error) {
  appendLog(
    `⚠️ [播放受阻] 请点击页面任意位置授权自动播放: ${error.message}`,
    "warn",
  );
  completeCurrentPlayback("blocked");
}

/**
 * Starts playback of one track and waits for completion.
 * @param {PlaybackTrack} track
 * @returns {Promise<string>}
 */
function playTrack(track) {
  activePlaybackTrack = track;
  const audioElement = getAudioElement();
  return new Promise((resolvePlayback) => {
    applicationState.resolveCurrentPlayback = resolvePlayback;
    audioElement.src = track.blobUrl;
    audioElement.onended = handleAudioEnded;
    audioElement.onerror = handleAudioError;
    const playResult = audioElement.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(handlePlayRejected);
    }
  });
}

/**
 * Downloads queued audio sequentially.
 * @returns {Promise<void>}
 */
export async function startDownloadWorker() {
  if (applicationState.isDownloading) return;
  applicationState.isDownloading = true;
  const workerRunId = applicationState.downloadRunId;

  while (
    applicationState.downloadQueue.length > 0 &&
    workerRunId === applicationState.downloadRunId
  ) {
    const task = applicationState.downloadQueue.shift();
    if (!task) break;
    updateQueueStatistics();

    if (task.priority[0] !== applicationState.pageTurnEpoch) {
      appendLog(`🧹 [丢弃旧页任务]: ${task.sequenceIdentifier}`, "info");
      continue;
    }

    const requestController = new AbortController();
    applicationState.downloadAbortController = requestController;
    try {
      appendLog(
        `⬇️ [开始下载] ID: ${task.sequenceIdentifier} ` +
        `(场景:${task.priority[1]}, 序号:#${task.priority[2]})`,
        "info",
      );
      const response = await fetch(task.audioUrl, {
        method: "GET",
        headers: { Accept: "audio/wav,audio/*;q=0.9,*/*;q=0.8" },
        signal: requestController.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const audioBlob = await response.blob();
      if (
        workerRunId !== applicationState.downloadRunId ||
        task.priority[0] !== applicationState.pageTurnEpoch
      ) {
        appendLog(
          `🧹 [下载结果已失效]: 已丢弃旧页音频 ${task.sequenceIdentifier}`,
          "info",
        );
        continue;
      }

      const blobUrl = URL.createObjectURL(audioBlob);
      applicationState.activeBlobUrls.add(blobUrl);
      localStorage.setItem("picbook_cached_audio_flag", "1");
      appendLog(
        `✅ [下载完成] ID: ${task.sequenceIdentifier} -> 推入播放队列`,
        "success",
      );
      enqueuePlayback({
        priority: task.priority,
        blobUrl,
        sequenceIdentifier: task.sequenceIdentifier,
      });
      void startPlaybackWorker();
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "AbortError") ||
        workerRunId === applicationState.downloadRunId
      ) {
        appendLog(
          `❌ [下载失败] ID: ${task.sequenceIdentifier} | 原因: ${error.message}`,
          "error",
        );
      }
    } finally {
      if (applicationState.downloadAbortController === requestController) {
        applicationState.downloadAbortController = null;
      }
    }
  }

  if (workerRunId === applicationState.downloadRunId) {
    applicationState.isDownloading = false;
  }
}

/**
 * Plays queued audio sequentially.
 * @returns {Promise<void>}
 */
export async function startPlaybackWorker() {
  if (applicationState.isPlaying) return;
  applicationState.isPlaying = true;
  const workerRunId = applicationState.playbackRunId;

  while (
    applicationState.playbackQueue.length > 0 &&
    workerRunId === applicationState.playbackRunId
  ) {
    const track = applicationState.playbackQueue.shift();
    if (!track) break;
    updateQueueStatistics();

    if (track.priority[0] !== applicationState.pageTurnEpoch) {
      releaseBlobUrl(track.blobUrl);
      appendLog(`🧹 [丢弃旧页播放项]: ${track.sequenceIdentifier}`, "info");
      continue;
    }

    setPlaybackStatus(
      `正在播放: 场景#${track.priority[1]} - 片段#${track.priority[2]} ` +
      `(${track.sequenceIdentifier})`,
      true,
    );
    appendLog(
      `🔊 [正在播放] 场景:${track.priority[1]} ` +
      `序号:#${track.priority[2]} (${track.sequenceIdentifier})`,
      "info",
    );

    const outcome = await playTrack(track);
    activePlaybackTrack = null;
    if (
      workerRunId !== applicationState.playbackRunId ||
      outcome === "cancelled"
    ) {
      releaseBlobUrl(track.blobUrl);
      break;
    }

    getAudioElement().removeAttribute("src");
    getAudioElement().load();
    releaseBlobUrl(track.blobUrl);
    if (outcome === "ended") {
      applicationState.cleanedAudioCount += 1;
      updateQueueStatistics();
      appendLog(
        `🗑️ [清理缓存] 已删除播放完毕的音频: ${track.sequenceIdentifier}`,
        "success",
      );
    }
  }

  if (workerRunId !== applicationState.playbackRunId) return;
  setPlaybackStatus("队列播放完毕，等待新音频...", false, true);
  applicationState.isPlaying = false;
}
