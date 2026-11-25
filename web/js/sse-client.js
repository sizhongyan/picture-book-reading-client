// @ts-check

/**
 * Server-Sent Events subscription and event interpretation.
 * @module sse-client
 */

import { stopAudioPipeline } from "./audio-cache.js";
import {
  enqueueDownload,
  parseAudioPriority,
} from "./audio-queue.js";
import { resolveAudioUrl } from "./audio-url.js";
import { startDownloadWorker } from "./audio-workers.js";
import { SSE_RECONNECT_DELAY_MILLISECONDS } from "./config.js";
import { advancePageGeneration, applicationState, setCurrentBook } from "./state.js";
import { appendLog, setSseStatus } from "./ui.js";

/** @typedef {import("./types.js").ServerEvent} ServerEvent */

/**
 * Delays asynchronous SSE reconnect attempts.
 * @param {number} delayMilliseconds
 * @returns {Promise<void>}
 */
function wait(delayMilliseconds) {
  return new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
}

/**
 * Handles a page-turn event from the server.
 * @returns {void}
 */
function handlePageTurningEvent() {
  const pageEpoch = advancePageGeneration();
  const revokedCount = stopAudioPipeline(
    `已切到第 ${pageEpoch} 页，旧页音频已停止`,
  );
  appendLog(
    `📖 [收到翻页事件]: 已暂停旧页音频，清空下载/播放队列` +
    `（释放 ${revokedCount} 个 Blob），等待第 ${pageEpoch} 页语音...`,
    "warn",
  );
}

/**
 * Handles one audio segment event.
 * @param {ServerEvent} event
 * @param {string} sseBaseUrl
 * @returns {void}
 */
function handleAudioDataEvent(event, sseBaseUrl) {
  const sceneIndex = event.scene_index ?? 0;
  if (event.done) {
    appendLog(`✔️ [场景完成]: 场景 #${sceneIndex} 音频列表推送完毕。`, "success");
    return;
  }

  const audioUrl = resolveAudioUrl(event.audio_url, sseBaseUrl);
  if (!audioUrl) {
    appendLog(
      `⚠️ [音频地址无效]: ${event.audio_url || "缺少 audio_url"}`,
      "warn",
    );
    return;
  }
  if (applicationState.dispatchedAudioUrls.has(audioUrl)) return;

  applicationState.dispatchedAudioUrls.add(audioUrl);
  const audioIndex = event.audio_index ?? 0;
  const priority = parseAudioPriority(sceneIndex, audioUrl, audioIndex);
  const urlParts = audioUrl.replace(/\/+$/, "").split("/");
  const sequenceIdentifier = urlParts.slice(-2).join("/");
  appendLog(
    `📥 [收到音频推送] ID: ${sequenceIdentifier} ` +
    `(场景:${sceneIndex}, 序号:#${priority[2]})`,
    "info",
  );
  enqueueDownload({
    priority,
    audioUrl,
    sequenceIdentifier,
  });
  void startDownloadWorker();
}

/**
 * Handles a book swap event from the server.
 * @param {ServerEvent} event
 * @returns {void}
 */
function handleBookSwapEvent(event) {
  advancePageGeneration();
  const revokedCount = stopAudioPipeline("已换书，旧书音频已停止");
  setCurrentBook(event.bookId || "", event.title || "");
  appendLog(
    `📚 [换书事件]: 已停止旧书音频并释放 ${revokedCount} 个 Blob`,
    "success",
  );
}

/**
 * Applies one parsed SSE event.
 * @param {ServerEvent} event
 * @param {string} sseBaseUrl
 * @returns {void}
 */
export function handleServerEvent(event, sseBaseUrl) {
  if (event.type === "page_turning_event") {
    handlePageTurningEvent();
  } else if (event.type === "data") {
    handleAudioDataEvent(event, sseBaseUrl);
  } else if (event.type === "book_swap_event") {
    handleBookSwapEvent(event);
  } else if (event.type === "stop_event") {
    setSseStatus("disconnected", "服务端断开");
    appendLog(
      `🛑 [服务端停止]: ${event.message || "连接关闭"}`,
      "warn",
    );
  }
}

/**
 * Processes one complete SSE data line.
 * @param {string} line
 * @param {string} sseBaseUrl
 * @returns {void}
 */
function processSseLine(line, sseBaseUrl) {
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith(":")) return;
  if (!trimmedLine.startsWith("data:")) return;

  try {
    const event = JSON.parse(trimmedLine.slice(5).trim());
    handleServerEvent(event, sseBaseUrl);
  } catch {
    appendLog("⚠️ [SSE 解析失败]: 收到无法解析的 data 行", "warn");
  }
}

/**
 * Connects to the device SSE subscription and reconnects until aborted.
 * @param {string} deviceId
 * @returns {Promise<void>}
 */
export async function startSseSubscription(deviceId) {
  applicationState.sseAbortController?.abort();
  const abortController = new AbortController();
  applicationState.sseAbortController = abortController;
  const signal = abortController.signal;
  const subscriptionBaseUrl = applicationState.serverBaseUrl;
  const subscriptionUrl =
    `${subscriptionBaseUrl}/api/v1/devices/` +
    `${encodeURIComponent(deviceId)}/subscription`;

  setSseStatus("connecting", "连接中...");
  appendLog(`📡 [SSE 订阅]: 正在连接 POST ${subscriptionUrl}`, "info");

  while (!signal.aborted) {
    try {
      const response = await fetch(subscriptionUrl, {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        signal,
      });
      if (response.status === 404) {
        setSseStatus("disconnected", "设备未在线(404)");
        appendLog(
          `⚠️ [设备未在线 404]: 设备 '${deviceId}' 尚未心跳，3 秒后重试`,
          "warn",
        );
        await wait(SSE_RECONNECT_DELAY_MILLISECONDS);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP 状态码 ${response.status}`);

      setSseStatus("connected", "SSE 监听中");
      appendLog(
        `✅ [SSE 订阅成功]: 正在监听设备 [${deviceId}]`,
        "success",
      );
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) processSseLine(line, subscriptionBaseUrl);
      }
    } catch (error) {
      if (signal.aborted) break;
      setSseStatus("disconnected", "重连中...");
      appendLog(
        `⚠️ [SSE 断开]: ${error.message}，3 秒后重连...`,
        "warn",
      );
      await wait(SSE_RECONNECT_DELAY_MILLISECONDS);
    }
  }
}
