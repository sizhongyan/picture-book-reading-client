// @ts-check

/**
 * High-level BLE operations for Wi-Fi provisioning and book switching.
 * @module ble-commands
 */

import {
  characteristicUuids,
  ensureBleSession,
  writeBleJson,
} from "./ble-connection.js";
import {
  addBleStatusListener,
  ensureBleStatusMonitor,
} from "./ble-status.js";
import { SWITCH_BOOK_REQUEST_ID } from "./config.js";
import { applicationState, setCurrentBook } from "./state.js";
import { appendLog, setBleCommandStatus } from "./ui.js";

/** @typedef {import("./types.js").BleStatusMessage} BleStatusMessage */

/**
 * Promise-based one-shot BLE status waiter with a hard timeout.
 */
class StatusCompletion {
  /**
   * @param {number} timeoutMilliseconds
   * @param {string} timeoutMessage
   */
  constructor(timeoutMilliseconds, timeoutMessage) {
    this.isSettled = false;
    this.timeoutHandle = 0;
    this.promise = new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
      this.timeoutHandle = window.setTimeout(
        () => this.fail(new Error(timeoutMessage)),
        timeoutMilliseconds,
      );
    });
  }

  /**
   * Resolves the waiter exactly once.
   * @param {BleStatusMessage} result
   * @returns {void}
   */
  finish(result) {
    if (this.isSettled) return;
    this.isSettled = true;
    window.clearTimeout(this.timeoutHandle);
    this.resolvePromise(result);
  }

  /**
   * Rejects the waiter exactly once.
   * @param {Error} error
   * @returns {void}
   */
  fail(error) {
    if (this.isSettled) return;
    this.isSettled = true;
    window.clearTimeout(this.timeoutHandle);
    this.rejectPromise(error);
  }
}

/**
 * Checks whether the user interface is already running a BLE command.
 * @returns {boolean}
 */
function rejectWhenBusy() {
  if (!applicationState.bleOperationBusy) return false;
  setBleCommandStatus("另一个蓝牙操作正在进行，请稍候。", "warn");
  return true;
}

/**
 * Handles a Wi-Fi status notification for one provisioning request.
 * @param {BleStatusMessage} status
 * @param {string} requestId
 * @param {StatusCompletion} completion
 * @returns {void}
 */
function handleWifiStatus(status, requestId, completion) {
  if (status.type !== "wifi_status") return;
  if (status.requestId && status.requestId !== requestId) return;

  const statusValue = status.status || "received";
  setBleCommandStatus(`开发板状态：${statusValue}`);
  if (statusValue === "connected") completion.finish(status);
  if (statusValue === "failed" || statusValue === "error") {
    completion.fail(
      new Error(status.message || "开发板连接 Wi-Fi 失败"),
    );
  }
}

/**
 * Handles a book switch status notification for one book request.
 * @param {BleStatusMessage} status
 * @param {string} requestId
 * @param {StatusCompletion} completion
 * @returns {void}
 */
function handleBookSwitchStatus(status, requestId, completion) {
  if (status.type !== "book_switch_status") return;
  if (status.requestId && status.requestId !== requestId) return;

  const statusValue = status.status || status.state || "received";
  const bookSuffix = status.bookId ? ` · bookId=${status.bookId}` : "";
  setBleCommandStatus(`换书进度：${statusValue}${bookSuffix}`);

  if (statusValue === "failed" || statusValue === "error") {
    completion.fail(new Error(status.message || "开发板换书失败"));
    return;
  }
  if (status.bookId) {
    setCurrentBook(status.bookId, status.title || "");
    completion.finish(status);
  }
}

/**
 * Sends Wi-Fi credentials to the connected board.
 * @param {string} ssid
 * @param {string} password
 * @returns {Promise<string>} Device ID after a successful connection.
 */
export async function provisionBoardWifi(ssid, password) {
  if (!ssid) throw new Error("请先填写 Wi-Fi 名称");
  if (rejectWhenBusy()) throw new Error("另一个蓝牙操作正在进行");

  applicationState.bleOperationBusy = true;
  let removeStatusListener = null;
  try {
    const session = await ensureBleSession();
    await ensureBleStatusMonitor(session);
    const requestId = `wifi-${Date.now()}`;
    const completion = new StatusCompletion(
      35000,
      "30 秒内未收到 Wi-Fi connected 状态",
    );
    removeStatusListener = addBleStatusListener((status) => {
      handleWifiStatus(status, requestId, completion);
    });

    await writeBleJson(session, characteristicUuids.wifiConfig, {
      type: "wifi_config",
      requestId,
      ssid,
      password,
    });
    await completion.promise;
    appendLog(`✅ [开发板联网成功]: ${session.deviceId} -> ${ssid}`, "success");
    setBleCommandStatus(`开发板已连接 Wi-Fi：${ssid}`, "success");
    return session.deviceId;
  } finally {
    if (removeStatusListener) removeStatusListener();
    applicationState.bleOperationBusy = false;
  }
}

/**
 * Sends the fixed switch_book command and waits for a book identifier.
 * @returns {Promise<BleStatusMessage>}
 */
export async function switchBoardBook() {
  if (rejectWhenBusy()) throw new Error("另一个蓝牙操作正在进行");

  applicationState.bleOperationBusy = true;
  let removeStatusListener = null;
  try {
    const session = await ensureBleSession();
    await ensureBleStatusMonitor(session);
    const completion = new StatusCompletion(
      35000,
      "30 秒内未收到书本识别结果",
    );
    removeStatusListener = addBleStatusListener((status) => {
      handleBookSwitchStatus(
        status,
        SWITCH_BOOK_REQUEST_ID,
        completion,
      );
    });

    await writeBleJson(session, characteristicUuids.control, {
      type: "switch_book",
      requestId: SWITCH_BOOK_REQUEST_ID,
    });
    const result = await completion.promise;
    appendLog(
      `📚 [换书完成]: bookId=${result.bookId || "未知"}`,
      "success",
    );
    setBleCommandStatus(
      `换书完成：${result.bookId || "已识别"}` +
      `${result.title ? " · " + result.title : ""}`,
      "success",
    );
    return result;
  } finally {
    if (removeStatusListener) removeStatusListener();
    applicationState.bleOperationBusy = false;
  }
}
