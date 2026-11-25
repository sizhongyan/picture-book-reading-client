// @ts-check

/**
 * Owns one reusable BLE connection and exposes characteristic operations.
 * @module ble-connection
 */

import {
  BLE_CONTROL_CHARACTERISTIC_UUID,
  BLE_DEVICE_ID_STORAGE_KEY,
  BLE_SERVICE_UUID,
  BLE_STATUS_CHARACTERISTIC_UUID,
  BLE_WIFI_CONFIG_CHARACTERISTIC_UUID,
} from "./config.js";
import {
  decodeTextValue,
  ensureNativeSession,
  ensureWebSession,
} from "./ble-session-factory.js";
import { applicationState } from "./state.js";
import { setBleCommandStatus } from "./ui.js";

/** @typedef {import("./types.js").BleSession} BleSession */

/**
 * Returns the Capacitor BLE client when running inside the APK.
 * @returns {any|null}
 */
function getNativeBleClient() {
  return window.PicBookBle?.BleClient || null;
}

/**
 * Creates a BLE session outside of the concurrency guard.
 * @returns {Promise<BleSession>}
 */
async function createBleSession() {
  const nativeClient = getNativeBleClient();
  if (nativeClient) {
    await nativeClient.initialize({ androidNeverForLocation: true });
    if (!(await nativeClient.isEnabled())) {
      await nativeClient.requestEnable();
    }
    return ensureNativeSession(nativeClient);
  }
  return ensureWebSession();
}

/**
 * Returns an active BLE session or creates one.
 * @returns {Promise<BleSession>}
 */
export async function ensureBleSession() {
  if (applicationState.bleSession?.isConnected) {
    return applicationState.bleSession;
  }
  if (applicationState.bleConnectingPromise) {
    return applicationState.bleConnectingPromise;
  }

  applicationState.bleConnectingPromise = createBleSession();
  try {
    const session = await applicationState.bleConnectingPromise;
    applicationState.bleSession = session;
    setBleCommandStatus(`已连接开发板：${session.deviceId}`, "success");
    return session;
  } finally {
    applicationState.bleConnectingPromise = null;
  }
}

/**
 * Explicitly disconnects and removes the remembered native peripheral.
 * @returns {Promise<void>}
 */
export async function disconnectBleSession() {
  const session = applicationState.bleSession;
  if (!session) {
    localStorage.removeItem(BLE_DEVICE_ID_STORAGE_KEY);
    return;
  }
  if (applicationState.bleStatusMonitorStop) {
    await applicationState.bleStatusMonitorStop().catch(() => {});
    applicationState.bleStatusMonitorStop = null;
    applicationState.bleStatusMonitorSession = null;
  }
  if (session.isNative) {
    await session.bleClient.disconnect(session.bleDeviceId).catch(() => {});
  } else if (session.webDevice?.gatt?.connected) {
    session.webDevice.gatt.disconnect();
  }
  session.isConnected = false;
  applicationState.bleSession = null;
  localStorage.removeItem(BLE_DEVICE_ID_STORAGE_KEY);
}

/**
 * Writes a JSON payload to one BLE characteristic.
 * @param {BleSession} session
 * @param {string} characteristicUuid
 * @param {Record<string, unknown>} payload
 * @returns {Promise<void>}
 */
export async function writeBleJson(
  session,
  characteristicUuid,
  payload,
) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (session.isNative) {
    const dataView = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    await session.bleClient.write(
      session.bleDeviceId,
      BLE_SERVICE_UUID,
      characteristicUuid,
      dataView,
      { timeout: 10000 },
    );
    return;
  }

  const characteristic = await session.webService.getCharacteristic(
    characteristicUuid,
  );
  if (
    characteristic.properties.writeWithoutResponse &&
    !characteristic.properties.write
  ) {
    await characteristic.writeValueWithoutResponse(bytes);
  } else {
    await characteristic.writeValueWithResponse(bytes);
  }
}

/**
 * Subscribes to Status characteristic notifications.
 * @param {BleSession} session
 * @param {(message:string) => void} onStatus
 * @returns {Promise<() => Promise<void>>}
 */
export async function subscribeBleStatus(session, onStatus) {
  if (session.isNative) {
    await session.bleClient.startNotifications(
      session.bleDeviceId,
      BLE_SERVICE_UUID,
      BLE_STATUS_CHARACTERISTIC_UUID,
      (value) => onStatus(decodeTextValue(value)),
    );
    return async () => {
      await session.bleClient
        .stopNotifications(
          session.bleDeviceId,
          BLE_SERVICE_UUID,
          BLE_STATUS_CHARACTERISTIC_UUID,
        )
        .catch(() => {});
    };
  }

  const characteristic = await session.webService.getCharacteristic(
    BLE_STATUS_CHARACTERISTIC_UUID,
  );
  const handleStatusEvent = (event) => {
    const target = event.target;
    onStatus(decodeTextValue(target.value));
  };
  characteristic.addEventListener(
    "characteristicvaluechanged",
    handleStatusEvent,
  );
  await characteristic.startNotifications();
  return async () => {
    characteristic.removeEventListener(
      "characteristicvaluechanged",
      handleStatusEvent,
    );
    await characteristic.stopNotifications().catch(() => {});
  };
}

export const characteristicUuids = Object.freeze({
  control: BLE_CONTROL_CHARACTERISTIC_UUID,
  wifiConfig: BLE_WIFI_CONFIG_CHARACTERISTIC_UUID,
  status: BLE_STATUS_CHARACTERISTIC_UUID,
});
