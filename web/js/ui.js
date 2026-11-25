// @ts-check

/**
 * DOM rendering helpers. Business modules call these functions instead of
 * manipulating status text and counters directly.
 * @module ui
 */

import { applicationState } from "./state.js";

/**
 * @param {string} elementId
 * @returns {HTMLElement}
 */
function requireElement(elementId) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Missing DOM element: ${elementId}`);
  }
  return element;
}

/**
 * Appends a timestamped message to the runtime console.
 * @param {string} message
 * @param {"info"|"success"|"warn"|"error"|"ble"} [messageType="info"]
 * @returns {void}
 */
export function appendLog(message, messageType = "info") {
  /** @type {Record<string, string>} */
  const colorClasses = {
    info: "text-slate-300",
    success: "text-emerald-400",
    warn: "text-amber-400",
    error: "text-rose-400",
    ble: "text-sky-400",
  };
  const container = requireElement("logContainer");
  const entry = document.createElement("div");
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  entry.className = `${colorClasses[messageType]} break-all`;
  entry.textContent = `[${time}] ${message}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

/**
 * Clears the runtime log panel.
 * @returns {void}
 */
export function clearLogs() {
  requireElement("logContainer").replaceChildren();
}

/**
 * Updates queue counters and the current page badge.
 * @returns {void}
 */
export function updateQueueStatistics() {
  requireElement("statDownloadQueue").textContent =
    String(applicationState.downloadQueue.length);
  requireElement("statPlaybackQueue").textContent =
    String(applicationState.playbackQueue.length);
  requireElement("statCleanedCount").textContent =
    String(applicationState.cleanedAudioCount);
  requireElement("pageEpochBadge").textContent =
    `页次: #${applicationState.pageTurnEpoch}`;
}

/**
 * Updates the SSE connection badge.
 * @param {"connected"|"connecting"|"disconnected"} status
 * @param {string} text
 * @returns {void}
 */
export function setSseStatus(status, text) {
  requireElement("sseStatusText").textContent = text;
  const dot = requireElement("sseDot");
  const baseClasses = "w-2 h-2 rounded-full";
  if (status === "connected") {
    dot.className = `${baseClasses} bg-emerald-400 animate-ping`;
  } else if (status === "connecting") {
    dot.className = `${baseClasses} bg-amber-400 animate-pulse`;
  } else {
    dot.className = `${baseClasses} bg-rose-400`;
  }
}

/**
 * Updates the hardware operation status box.
 * @param {string} text
 * @param {"info"|"success"|"warn"|"error"} [statusType="info"]
 * @returns {void}
 */
export function setBleCommandStatus(text, statusType = "info") {
  const statusClasses = {
    info: "text-slate-500 bg-slate-50",
    success: "text-emerald-700 bg-emerald-50",
    warn: "text-amber-700 bg-amber-50",
    error: "text-rose-700 bg-rose-50",
  };
  const element = requireElement("bleCommandStatus");
  element.textContent = text;
  element.className = `text-[11px] rounded-lg px-3 py-2 ${statusClasses[statusType]}`;
}

/**
 * Updates the current playback description and speaker icon.
 * @param {string} text
 * @param {boolean} isActive
 * @param {boolean} [isMuted=false]
 * @returns {void}
 */
export function setPlaybackStatus(text, isActive, isMuted = false) {
  const iconBox = requireElement("playingIconBox");
  const icon = requireElement("playingIcon");
  requireElement("nowPlayingDetail").textContent = text;
  iconBox.classList.toggle("pulse-ring", isActive);
  icon.className = isMuted
    ? "fa-solid fa-volume-off text-lg"
    : "fa-solid fa-volume-high text-lg";
}

/**
 * Updates the visible device identifier.
 * @param {string} deviceId
 * @returns {void}
 */
export function setCurrentDeviceId(deviceId) {
  requireElement("currentDeviceIdDisplay").textContent = deviceId;
}

/**
 * Sets the server URL input value.
 * @param {string} serverBaseUrl
 * @returns {void}
 */
export function setServerBaseUrlInput(serverBaseUrl) {
  /** @type {HTMLInputElement} */
  const input = /** @type {HTMLInputElement} */ (
    requireElement("serverBaseUrlInput")
  );
  input.value = serverBaseUrl;
}
