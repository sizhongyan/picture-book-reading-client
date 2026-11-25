// @ts-check

/**
 * Application entry point. This module binds DOM controls to small feature
 * modules; page markup contains no inline JavaScript.
 * @module app
 */

import { clearAllAudioCache } from "./audio-cache.js";
import { provisionBoardWifi, switchBoardBook } from "./ble-commands.js";
import {
  APPLICATION_BUILD_ID,
  APPLICATION_BUILD_STORAGE_KEY,
} from "./config.js";
import {
  connectBoardAndSubscribe,
  connectManually,
  disconnectBoard,
} from "./device-controller.js";
import { saveServerBaseUrl } from "./server-settings.js";
import { startSseSubscription } from "./sse-client.js";
import { applicationState } from "./state.js";
import {
  appendLog,
  clearLogs,
  setBleCommandStatus,
  setServerBaseUrlInput,
} from "./ui.js";

/**
 * Reads a required input value.
 * @param {string} elementId
 * @returns {string}
 */
function readInputValue(elementId) {
  const input = /** @type {HTMLInputElement} */ (
    document.getElementById(elementId)
  );
  return input.value;
}

/**
 * Clears and resets an input value.
 * @param {string} elementId
 * @returns {void}
 */
function clearInputValue(elementId) {
  const input = /** @type {HTMLInputElement} */ (
    document.getElementById(elementId)
  );
  input.value = "";
}

/** @returns {void} */
function handleScanButtonClick() {
  void connectBoardAndSubscribe();
}

/** @returns {void} */
function handleManualSubscriptionClick() {
  connectManually(readInputValue("manualDeviceIdInput"));
}

/** @returns {void} */
function handleServerSaveClick() {
  try {
    const normalizedUrl = saveServerBaseUrl(
      readInputValue("serverBaseUrlInput"),
    );
    setServerBaseUrlInput(normalizedUrl);
    appendLog(`🔧 [服务端地址]: 已保存 ${normalizedUrl}`, "success");
    if (applicationState.currentDeviceId) {
      void startSseSubscription(applicationState.currentDeviceId);
    }
  } catch (error) {
    appendLog(`❌ [服务端地址无效]: ${error.message}`, "error");
  }
}

/** @returns {Promise<void>} */
async function handleWifiProvisionClick() {
  const ssid = readInputValue("wifiSsidInput").trim();
  const password = readInputValue("wifiPasswordInput");
  try {
    const deviceId = await provisionBoardWifi(ssid, password);
    clearInputValue("wifiPasswordInput");
    if (!applicationState.currentDeviceId) {
      connectManually(deviceId);
    }
  } catch (error) {
    setBleCommandStatus(`Wi-Fi 配置失败：${error.message}`, "error");
    appendLog(`❌ [Wi-Fi 配置失败]: ${error.message}`, "error");
  }
}

/** @returns {Promise<void>} */
async function handleBookSwitchClick() {
  try {
    await switchBoardBook();
  } catch (error) {
    setBleCommandStatus(`换书失败：${error.message}`, "error");
    appendLog(`❌ [换书失败]: ${error.message}`, "error");
  }
}

/** @returns {void} */
function handleDisconnectClick() {
  void disconnectBoard();
}

/** @returns {void} */
function handleClearAudioClick() {
  clearAllAudioCache(true);
}

/**
 * Binds buttons by element ID.
 * @returns {void}
 */
function bindButtonHandlers() {
  document
    .getElementById("buttonScanBle")
    ?.addEventListener("click", handleScanButtonClick);
  document
    .getElementById("buttonSubscribeSse")
    ?.addEventListener("click", handleManualSubscriptionClick);
  document
    .getElementById("buttonSaveServerUrl")
    ?.addEventListener("click", handleServerSaveClick);
  document
    .getElementById("buttonProvisionWifi")
    ?.addEventListener("click", handleWifiProvisionClick);
  document
    .getElementById("buttonSwitchBook")
    ?.addEventListener("click", handleBookSwitchClick);
  document
    .getElementById("buttonDisconnectBle")
    ?.addEventListener("click", handleDisconnectClick);
  document
    .getElementById("buttonClearAudioCache")
    ?.addEventListener("click", handleClearAudioClick);
  document
    .getElementById("buttonClearLogs")
    ?.addEventListener("click", clearLogs);
}

/**
 * Clears browser caches when the embedded asset build changes.
 * @returns {void}
 */
function invalidateCachesForNewBuild() {
  const savedBuildId = localStorage.getItem(APPLICATION_BUILD_STORAGE_KEY);
  if (savedBuildId === APPLICATION_BUILD_ID) return;
  localStorage.setItem(APPLICATION_BUILD_STORAGE_KEY, APPLICATION_BUILD_ID);
  if ("caches" in window) {
    caches.keys().then((cacheNames) => {
      for (const cacheName of cacheNames) void caches.delete(cacheName);
    });
  }
}

/**
 * Initializes the standalone mobile client.
 * @returns {void}
 */
export function initializeApplication() {
  setServerBaseUrlInput(applicationState.serverBaseUrl);
  bindButtonHandlers();
  clearAllAudioCache(false);
  invalidateCachesForNewBuild();
  appendLog(`🔖 [客户端构建]: ${APPLICATION_BUILD_ID}`, "info");
  appendLog("🚀 绘本智能伴读移动客户端已就绪。", "info");
}

window.addEventListener("DOMContentLoaded", initializeApplication);
