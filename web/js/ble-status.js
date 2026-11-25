// @ts-check

/**
 * Persistent BLE status notification routing. Hardware page failures and book
 * results are forwarded to the UI and to operation-specific listeners.
 * @module ble-status
 */

import { subscribeBleStatus } from "./ble-connection.js";
import { applicationState, setCurrentBook } from "./state.js";
import { appendLog, setBleCommandStatus } from "./ui.js";

/** @typedef {import("./types.js").BleSession} BleSession */
/** @typedef {import("./types.js").BleStatusMessage} BleStatusMessage */

/**
 * Parses a BLE status message without throwing on malformed input.
 * @param {string} rawText
 * @returns {BleStatusMessage}
 */
export function parseBleStatusMessage(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return { type: "raw_status", message: rawText };
  }
}

/**
 * Displays page-turn diagnostics returned by the development board.
 * @param {BleStatusMessage} status
 * @returns {void}
 */
function displayPageTurningStatus(status) {
  const statusValue = status.status || status.state || "received";
  const isFailure = /^(failed|error|timeout)$/i.test(statusValue);
  const detail = status.message || status.detail || "";
  const stage = status.stage ? ` | 阶段:${status.stage}` : "";
  const httpStatus = status.httpStatus
    ? ` | HTTP ${status.httpStatus}`
    : "";
  setBleCommandStatus(
    `翻页状态：${statusValue}${detail ? " · " + detail : ""}`,
    isFailure ? "error" : "info",
  );
  appendLog(
    `📖 [开发板翻页状态]: ${statusValue}${stage}${httpStatus}` +
    `${detail ? " | " + detail : ""}`,
    isFailure ? "error" : "info",
  );
}

/**
 * Routes one BLE status message to UI state and registered listeners.
 * @param {string} rawText
 * @returns {BleStatusMessage}
 */
export function dispatchBleStatus(rawText) {
  const status = parseBleStatusMessage(rawText);
  const statusType = status.type || "unknown";
  const statusValue = status.status || status.state || "";
  const detail = status.message || status.detail || "";
  const isFailure = /^(failed|error|timeout)$/i.test(statusValue);

  if (
    statusType === "page_turning_status" ||
    statusType === "page_turn_status"
  ) {
    displayPageTurningStatus(status);
  } else if (statusType === "book_switch_status") {
    setCurrentBook(status.bookId || "", status.title || "");
  } else if (statusType === "wifi_status" && isFailure) {
    setBleCommandStatus(
      `Wi-Fi 配置失败：${detail || statusValue}`,
      "error",
    );
  } else if (!["wifi_status", "book_switch_status"].includes(statusType)) {
    setBleCommandStatus(
      `开发板状态：${statusType}${statusValue ? " / " + statusValue : ""}`,
      isFailure ? "error" : "info",
    );
  }

  for (const listener of applicationState.bleStatusListeners) {
    try {
      listener(status);
    } catch (error) {
      appendLog(`⚠️ [BLE 状态处理异常]: ${error.message}`, "warn");
    }
  }
  return status;
}

/**
 * Stops persistent BLE status notifications.
 * @returns {Promise<void>}
 */
export async function stopBleStatusMonitor() {
  if (applicationState.bleStatusMonitorStop) {
    await applicationState.bleStatusMonitorStop().catch(() => {});
  }
  applicationState.bleStatusMonitorStop = null;
  applicationState.bleStatusMonitorSession = null;
}

/**
 * Makes sure the Status characteristic is monitored for the active session.
 * @param {BleSession} session
 * @returns {Promise<void>}
 */
export async function ensureBleStatusMonitor(session) {
  if (
    applicationState.bleStatusMonitorSession === session &&
    applicationState.bleStatusMonitorStop
  ) {
    return;
  }
  await stopBleStatusMonitor();
  applicationState.bleStatusMonitorStop = await subscribeBleStatus(
    session,
    dispatchBleStatus,
  );
  applicationState.bleStatusMonitorSession = session;
  appendLog("📡 [BLE Status]: 已建立常驻通知监听", "ble");
}

/**
 * Registers one temporary status consumer for a hardware operation.
 * @param {(status:BleStatusMessage) => void} listener
 * @returns {() => void}
 */
export function addBleStatusListener(listener) {
  applicationState.bleStatusListeners.add(listener);
  return () => applicationState.bleStatusListeners.delete(listener);
}
