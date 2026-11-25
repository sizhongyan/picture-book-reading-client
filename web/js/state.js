// @ts-check

/**
 * Runtime state. Mutable objects are centralized here so feature modules do
 * not maintain hidden copies of queues, connection state, or page generations.
 * @module state
 */

import {
  DEFAULT_SERVER_BASE_URL,
  SERVER_BASE_URL_STORAGE_KEY,
} from "./config.js";

/** @typedef {import("./types.js").BleSession} BleSession */
/** @typedef {import("./types.js").DownloadTask} DownloadTask */
/** @typedef {import("./types.js").PlaybackTrack} PlaybackTrack */

const savedServerBaseUrl =
  localStorage.getItem(SERVER_BASE_URL_STORAGE_KEY) || DEFAULT_SERVER_BASE_URL;

export const applicationState = {
  /** @type {string} */
  serverBaseUrl: savedServerBaseUrl,
  /** @type {string} */
  currentDeviceId: "",
  /** @type {string} */
  currentBookId: "",
  /** @type {number} */
  pageTurnEpoch: 0,
  /** @type {number} */
  cleanedAudioCount: 0,
  /** @type {AbortController|null} */
  sseAbortController: null,
  /** @type {Set<string>} */
  dispatchedAudioUrls: new Set(),
  /** @type {DownloadTask[]} */
  downloadQueue: [],
  /** @type {PlaybackTrack[]} */
  playbackQueue: [],
  /** @type {Set<string>} */
  activeBlobUrls: new Set(),
  /** @type {boolean} */
  isDownloading: false,
  /** @type {boolean} */
  isPlaying: false,
  /** @type {AbortController|null} */
  downloadAbortController: null,
  /** @type {number} */
  downloadRunId: 0,
  /** @type {number} */
  playbackRunId: 0,
  /** @type {((outcome: string) => void)|null} */
  resolveCurrentPlayback: null,
  /** @type {BleSession|null} */
  bleSession: null,
  /** @type {Promise<BleSession>|null} */
  bleConnectingPromise: null,
  /** @type {boolean} */
  bleOperationBusy: false,
  /** @type {BleSession|null} */
  bleStatusMonitorSession: null,
  /** @type {(() => Promise<void>)|null} */
  bleStatusMonitorStop: null,
  /** @type {Set<(message: import("./types.js").BleStatusMessage) => void>} */
  bleStatusListeners: new Set(),
};

/**
 * Advances the page generation and discards URL deduplication for the old page.
 * @returns {number} The new page generation.
 */
export function advancePageGeneration() {
  applicationState.pageTurnEpoch += 1;
  applicationState.dispatchedAudioUrls.clear();
  return applicationState.pageTurnEpoch;
}

/**
 * Stores the currently selected book and updates presentation state.
 * @param {string} bookId
 * @param {string} [title]
 * @returns {void}
 */
export function setCurrentBook(bookId, title = "") {
  applicationState.currentBookId = bookId;
  document.getElementById("currentBookIdDisplay").textContent =
    title ? `${bookId} · ${title}` : bookId;
}
