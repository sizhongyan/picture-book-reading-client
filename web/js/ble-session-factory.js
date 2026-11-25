// @ts-check

/**
 * Creates and restores native or Web Bluetooth sessions. This module also
 * provides the shared UTF-8 decoder for device IDs and status messages.
 * @module ble-session-factory
 */

import {
  BLE_DEVICE_ID_CHARACTERISTIC_UUID,
  BLE_DEVICE_ID_STORAGE_KEY,
  BLE_DEVICE_NAME_PREFIX,
  BLE_SERVICE_UUID,
} from "./config.js";
import { applicationState } from "./state.js";
import { appendLog, setBleCommandStatus } from "./ui.js";

/** @typedef {import("./types.js").BleSession} BleSession */

/**
 * Handles a BLE disconnect without discarding the Android authorization.
 * @param {BleSession} session
 * @param {string} bleDeviceId
 * @returns {void}
 */
function handleBleDisconnected(session, bleDeviceId) {
  session.isConnected = false;
  if (applicationState.bleStatusMonitorSession === session) {
    applicationState.bleStatusMonitorSession = null;
    applicationState.bleStatusMonitorStop = null;
  }
  setBleCommandStatus(
    `开发板蓝牙已断开：${bleDeviceId}。下次操作会自动重连。`,
    "warn",
  );
  appendLog(
    `⚠️ [蓝牙断开]: ${bleDeviceId}，已保留设备记忆用于自动重连`,
    "warn",
  );
}

/**
 * Converts a BLE DataView into a trimmed UTF-8 string.
 * @param {DataView} value
 * @returns {string}
 */
export function decodeTextValue(value) {
  const rawText = new TextDecoder("utf-8")
    .decode(value)
    .replace(/\0/g, "")
    .trim();
  if (!rawText) throw new Error("开发板返回了空数据");
  return rawText;
}

/**
 * Reads the business Device ID characteristic.
 * @param {BleSession} session
 * @returns {Promise<string>}
 */
async function readBleDeviceId(session) {
  if (session.isNative) {
    const value = await session.bleClient.read(
      session.bleDeviceId,
      BLE_SERVICE_UUID,
      BLE_DEVICE_ID_CHARACTERISTIC_UUID,
      { timeout: 15000 },
    );
    return decodeTextValue(value);
  }
  const characteristic = await session.webService.getCharacteristic(
    BLE_DEVICE_ID_CHARACTERISTIC_UUID,
  );
  return decodeTextValue(await characteristic.readValue());
}

/**
 * Creates a connected native session from a selected peripheral.
 * @param {any} bleClient
 * @param {{deviceId:string,name?:string,localName?:string}} device
 * @returns {Promise<BleSession>}
 */
async function createNativeSession(bleClient, device) {
  /** @type {BleSession} */
  const session = {
    isNative: true,
    bleClient,
    bleDeviceId: device.deviceId,
    deviceId: "",
    isConnected: false,
    name: device.name || device.localName || "PicBook",
  };
  await bleClient.connect(
    device.deviceId,
    (deviceId) => handleBleDisconnected(session, deviceId),
    { timeout: 20000 },
  );
  session.isConnected = true;
  session.deviceId = await readBleDeviceId(session);
  return session;
}

/**
 * Restores an Android-authorized peripheral without broadcasting a new scan.
 * @param {any} bleClient
 * @returns {Promise<BleSession|null>}
 */
async function restoreNativeSession(bleClient) {
  const savedDeviceId = localStorage.getItem(BLE_DEVICE_ID_STORAGE_KEY);
  if (!savedDeviceId) return null;

  let devices = [];
  try {
    devices = await bleClient.getDevices([savedDeviceId]);
  } catch {
    return null;
  }
  if (!devices.length) return null;

  const session = {
    isNative: true,
    bleClient,
    bleDeviceId: savedDeviceId,
    deviceId: "",
    isConnected: false,
    name: devices[0].name || "PicBook",
  };
  try {
    await bleClient.connect(
      savedDeviceId,
      (deviceId) => handleBleDisconnected(session, deviceId),
      { timeout: 15000 },
    );
    session.isConnected = true;
    session.deviceId = await readBleDeviceId(session);
    return session;
  } catch {
    return null;
  }
}

/**
 * Opens a native BLE session, preferring a remembered peripheral.
 * @param {any} bleClient
 * @returns {Promise<BleSession>}
 */
export async function ensureNativeSession(bleClient) {
  const restoredSession = await restoreNativeSession(bleClient);
  if (restoredSession) {
    appendLog(`🔗 [BLE 会话复用]: ${restoredSession.deviceId}`, "ble");
    return restoredSession;
  }

  appendLog(`🔍 [蓝牙扫描]: 搜索前缀 '${BLE_DEVICE_NAME_PREFIX}'`, "ble");
  const device = await bleClient.requestDevice({
    namePrefix: BLE_DEVICE_NAME_PREFIX,
    services: [BLE_SERVICE_UUID],
    optionalServices: [BLE_SERVICE_UUID],
    allowExtendedAdvertising: true,
  });
  const session = await createNativeSession(bleClient, device);
  localStorage.setItem(BLE_DEVICE_ID_STORAGE_KEY, session.bleDeviceId);
  appendLog(`🔗 [BLE 长连接建立]: ${session.deviceId}`, "ble");
  return session;
}

/**
 * Opens a browser Web Bluetooth session.
 * @returns {Promise<BleSession>}
 */
export async function ensureWebSession() {
  if (!navigator.bluetooth) throw new Error("当前环境不支持蓝牙");
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: BLE_DEVICE_NAME_PREFIX },
      { services: [BLE_SERVICE_UUID] },
    ],
    optionalServices: [BLE_SERVICE_UUID],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(BLE_SERVICE_UUID);
  /** @type {BleSession} */
  const session = {
    isNative: false,
    webDevice: device,
    webService: service,
    bleDeviceId: device.id,
    deviceId: "",
    isConnected: true,
    name: device.name || "PicBook",
  };
  session.deviceId = await readBleDeviceId(session);
  return session;
}
