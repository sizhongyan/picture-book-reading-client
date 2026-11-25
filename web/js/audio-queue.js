// @ts-check

/**
 * Priority ordering and queue insertion for audio downloads and playback.
 * @module audio-queue
 */

import { applicationState } from "./state.js";
import { updateQueueStatistics } from "./ui.js";

/** @typedef {import("./types.js").DownloadTask} DownloadTask */
/** @typedef {import("./types.js").PlaybackTrack} PlaybackTrack */

/**
 * Builds the three-level priority tuple for one audio segment.
 * @param {number} sceneIndex
 * @param {string} audioUrl
 * @param {number} [fallbackAudioIndex=0]
 * @returns {[number, number, number]}
 */
export function parseAudioPriority(
  sceneIndex,
  audioUrl,
  fallbackAudioIndex = 0,
) {
  let sequenceNumber = fallbackAudioIndex;
  try {
    const urlParts = audioUrl.replace(/\/+$/, "").split("/");
    const parsedSequence = Number.parseInt(urlParts.at(-1) || "", 10);
    if (!Number.isNaN(parsedSequence)) sequenceNumber = parsedSequence;
  } catch {
    // Fall back to the server-provided audio index.
  }
  return [applicationState.pageTurnEpoch, sceneIndex, sequenceNumber];
}

/**
 * @param {DownloadTask|PlaybackTrack} left
 * @param {DownloadTask|PlaybackTrack} right
 * @returns {number}
 */
export function comparePriority(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.priority[index] !== right.priority[index]) {
      return left.priority[index] - right.priority[index];
    }
  }
  return 0;
}

/**
 * Inserts a download task in priority order.
 * @param {DownloadTask} task
 * @returns {void}
 */
export function enqueueDownload(task) {
  if (task.priority[0] !== applicationState.pageTurnEpoch) return;
  applicationState.downloadQueue.push(task);
  applicationState.downloadQueue.sort(comparePriority);
  updateQueueStatistics();
}

/**
 * Inserts a playback task in priority order.
 * @param {PlaybackTrack} track
 * @returns {void}
 */
export function enqueuePlayback(track) {
  if (track.priority[0] !== applicationState.pageTurnEpoch) return;
  applicationState.playbackQueue.push(track);
  applicationState.playbackQueue.sort(comparePriority);
  updateQueueStatistics();
}
