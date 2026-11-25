const path = require("path");
const puppeteer = require("puppeteer-core");
const { startStaticServer, stopStaticServer } = require("./static_server");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const webDirectory = path.resolve(__dirname, "..", "web");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadModules(page) {
  return page.evaluate(async () => {
    window.__testModules = {
      state: await import("/js/state.js"),
      audioCache: await import("/js/audio-cache.js"),
      audioQueue: await import("/js/audio-queue.js"),
      audioWorkers: await import("/js/audio-workers.js"),
      audioUrl: await import("/js/audio-url.js"),
      sseClient: await import("/js/sse-client.js"),
    };
  });
}

async function installFakeAudio(page) {
  return page.evaluate(() => {
    const audio = document.getElementById("htmlAudioPlayer");
    window.__pauseCalls = 0;
    audio.pause = () => { window.__pauseCalls += 1; };
    audio.load = () => {};
    audio.play = () => new Promise(() => {});
    let testSource = "";
    const originalRemoveAttribute = audio.removeAttribute.bind(audio);
    Object.defineProperty(audio, "src", {
      configurable: true,
      get: () => testSource,
      set: value => { testSource = value; },
    });
    audio.removeAttribute = name => {
      if (name === "src") testSource = "";
      return originalRemoveAttribute(name);
    };
  });
}

async function readState(page) {
  return page.evaluate(() => {
    const state = window.__testModules.state.applicationState;
    return {
      pageTurnEpoch: state.pageTurnEpoch,
      downloadQueueLength: state.downloadQueue.length,
      playbackQueueLength: state.playbackQueue.length,
      activeBlobUrlCount: state.activeBlobUrls.size,
      isDownloading: state.isDownloading,
      isPlaying: state.isPlaying,
      audioSrc: document.getElementById("htmlAudioPlayer").src,
      pauseCalls: window.__pauseCalls,
    };
  });
}

async function main() {
  const { server, baseUrl } = await startStaticServer(webDirectory);
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle0" });
    await loadModules(page);
    await installFakeAudio(page);

    await page.evaluate(() => {
      const { state, audioQueue, audioWorkers } = window.__testModules;
      const blobUrl = URL.createObjectURL(
        new Blob(["fake-audio"], { type: "audio/wav" }),
      );
      audioQueue.enqueuePlayback({
        priority: [state.applicationState.pageTurnEpoch, 0, 0],
        blobUrl,
        sequenceIdentifier: "test/0",
      });
      void audioWorkers.startPlaybackWorker();
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    const playing = await readState(page);
    assert(playing.isPlaying, "测试准备失败：播放器没有进入播放状态");
    assert(playing.audioSrc, "测试准备失败：audio.src 没有设置");

    await page.evaluate(() => {
      window.__testModules.sseClient.handleServerEvent(
        { type: "page_turning_event" },
        location.origin,
      );
    });
    const stopped = await readState(page);
    assert(stopped.pageTurnEpoch === 1, "翻页页次没有递增");
    assert(stopped.pauseCalls >= 1, "翻页后没有调用 audio.pause()");
    assert(!stopped.audioSrc, "翻页后 audio.src 没有移除");
    assert(stopped.downloadQueueLength === 0, "翻页后下载队列没有清空");
    assert(stopped.playbackQueueLength === 0, "翻页后播放队列没有清空");
    assert(stopped.activeBlobUrlCount === 0, "翻页后 Blob 没有释放");

    await page.evaluate(() => {
      window.__oldPageFetchStarted = false;
      window.__oldPageFetchFinish = null;
      window.fetch = () => {
        window.__oldPageFetchStarted = true;
        return new Promise(resolve => {
          window.__oldPageFetchFinish = resolve;
        });
      };
      const { state, audioQueue, audioWorkers } = window.__testModules;
      audioQueue.enqueueDownload({
        priority: [state.applicationState.pageTurnEpoch, 0, 0],
        audioUrl: "https://example.invalid/old-page/0",
        sequenceIdentifier: "old-page/0",
      });
      void audioWorkers.startDownloadWorker();
    });
    await page.waitForFunction(() => window.__oldPageFetchStarted === true);
    await page.evaluate(() => {
      window.__testModules.sseClient.handleServerEvent(
        { type: "page_turning_event" },
        location.origin,
      );
      window.__oldPageFetchFinish(
        new Response(
          new Blob(["late-old-page-audio"], { type: "audio/wav" }),
          { status: 200 },
        ),
      );
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    const stale = await readState(page);
    assert(stale.downloadQueueLength === 0, "迟到下载回流到下载队列");
    assert(stale.playbackQueueLength === 0, "迟到下载回流到播放队列");
    assert(stale.activeBlobUrlCount === 0, "迟到下载没有释放 Blob");
    assert(!stale.isDownloading, "下载状态没有复位");

    await page.evaluate(() => {
      const { state, audioQueue, audioWorkers } = window.__testModules;
      const blobUrl = URL.createObjectURL(
        new Blob(["old-book-audio"], { type: "audio/wav" }),
      );
      audioQueue.enqueuePlayback({
        priority: [state.applicationState.pageTurnEpoch, 0, 0],
        blobUrl,
        sequenceIdentifier: "old-book/0",
      });
      void audioWorkers.startPlaybackWorker();
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    await page.evaluate(() => {
      window.__testModules.sseClient.handleServerEvent(
        { type: "book_swap_event", bookId: "book_new" },
        location.origin,
      );
    });
    const swapped = await readState(page);
    assert(swapped.pageTurnEpoch === 3, "换书没有开启新的音频轮次");
    assert(swapped.downloadQueueLength === 0, "换书后下载队列没有清空");
    assert(swapped.playbackQueueLength === 0, "换书后播放队列没有清空");
    assert(swapped.activeBlobUrlCount === 0, "换书后 Blob 没有释放");

    const resolvedUrls = await page.evaluate(() => {
      const resolver = window.__testModules.audioUrl.resolveAudioUrl;
      return {
        rootPath: resolver("/api/v1/audio/abc/3", "https://example.com"),
        subPath: resolver(
          "api/v1/audio/abc/4",
          "https://example.com/picbook",
        ),
      };
    });
    assert(
      resolvedUrls.rootPath === "https://example.com/api/v1/audio/abc/3",
      `根路径 audio_url 解析错误：${resolvedUrls.rootPath}`,
    );
    assert(
      resolvedUrls.subPath ===
        "https://example.com/picbook/api/v1/audio/abc/4",
      `子路径 audio_url 解析错误：${resolvedUrls.subPath}`,
    );
    assert(pageErrors.length === 0, `页面异常：${pageErrors.join(" | ")}`);

    console.log(JSON.stringify({
      result: "PASS",
      cases: [
        "翻页时停止播放并清空双队列",
        "迟到下载结果不会回流",
        "book_swap_event 清空旧书音频",
        "相对 audio_url 按 SSE base URL 解析",
      ],
      pageErrors,
    }, null, 2));
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
