// @ts-check

/**
 * Coordinates device identity, BLE session lifetime, and SSE binding.
 * @module device-controller
 */

import {
  disconnectBleSession,
  ensureBleSession,
} from "./ble-connection.js";
import { ensureBleStatusMonitor } from "./ble-status.js";
import { startSseSubscription } from "./sse-client.js";
import { applicationState } from "./state.js";
import {
  appendLog,
  setBleCommandStatus,
  setCurrentDeviceId,
} from "./ui.js";

/**
 * Binds a device identifier to the UI and starts its SSE subscription.
 * @param {string} deviceId
 * @returns {void}
 */
export function bindDevice(deviceId) {
  const trimmedDeviceId = deviceId.trim();
  if (!trimmedDeviceId) throw new Error("设备 ID 不能为空");

  applicationState.currentDeviceId = trimmedDeviceId;
  setCurrentDeviceId(trimmedDeviceId);
  const input = /** @type {HTMLInputElement} */ (
    document.getElementById("manualDeviceIdInput")
  );
  input.value = trimmedDeviceId;
  void startSseSubscription(trimmedDeviceId);
}

/**
 * Connects to or reuses the BLE session, then subscribes to status and SSE.
 * @returns {Promise<void>}
 */
export async function connectBoardAndSubscribe() {
  try {
    const session = await ensureBleSession();
    await ensureBleStatusMonitor(session);
    appendLog(
      `🎉 [蓝牙连接]: Device ID=${session.deviceId}，连接保持复用`,
      "success",
    );
    bindDevice(session.deviceId);
  } catch (error) {
    appendLog(`❌ [蓝牙连接失败]: ${error.message}`, "error");
    setBleCommandStatus(`蓝牙连接失败：${error.message}`, "error");
  }
}

/**
 * Connects SSE using a manually entered device identifier.
 * @param {string} deviceId
 * @returns {void}
 */
export function connectManually(deviceId) {
  try {
    bindDevice(deviceId);
  } catch (error) {
    appendLog(`⚠️ [设备 ID 无效]: ${error.message}`, "warn");
  }
}

/**
 * Releases the active BLE session and removes its remembered identifier.
 * @returns {Promise<void>}
 */
export async function disconnectBoard() {
  try {
    await disconnectBleSession();
    setBleCommandStatus("蓝牙已断开，下次扫描可重新选择开发板。", "info");
    appendLog("🔌 [蓝牙会话]: 已主动断开", "ble");
  } catch (error) {
    appendLog(`❌ [断开蓝牙失败]: ${error.message}`, "error");
    setBleCommandStatus(`断开蓝牙失败：${error.message}`, "error");
  }
}
